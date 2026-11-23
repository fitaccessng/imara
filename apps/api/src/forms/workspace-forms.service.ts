import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadInput, readUploadPrefix } from '../storage/storage.service';
import { WorkspaceSubscriptionService } from '../subscriptions/workspace-subscription.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WorkspaceStorageService } from '../workspaces/workspace-storage.service';
import { CreateWorkspaceFormDto, SubmitWorkspaceFormDto, UpdateWorkspaceFormDto } from './workspace-forms.dto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_QUESTIONS = 50;
const MAX_CHOICES = 30;
const MAX_FORM_UPLOAD_BYTES = 5 * 1024 * 1024;
type JsonRecord = Record<string, unknown>;

@Injectable()
export class WorkspaceFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly subscriptions: WorkspaceSubscriptionService,
    private readonly workspaceStorage: WorkspaceStorageService,
  ) {}

  private badRequest(message: string): never {
    throw new BadRequestException(message);
  }

  private assertObject(value: unknown, label: string): asserts value is JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) this.badRequest(`${label} must be an object`);
  }

  private assertKeys(value: JsonRecord, allowed: string[], label: string) {
    if (Object.keys(value).some((key) => !allowed.includes(key))) this.badRequest(`${label} contains an unsupported field`);
  }

  private assertJsonSize(value: unknown, label: string) {
    try {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) this.badRequest(`${label} must not exceed 64 KB`);
    } catch {
      this.badRequest(`${label} is invalid`);
    }
  }

  private validateSchema(value: unknown, requireComplete = false): Prisma.InputJsonValue {
    this.assertObject(value, 'schema');
    this.assertKeys(value, ['questions'], 'schema');
    const source = value.questions ?? [];
    if (!Array.isArray(source) || source.length > MAX_QUESTIONS) {
      this.badRequest(`A form must contain at most ${MAX_QUESTIONS} questions`);
    }
    if (requireComplete && source.length === 0) this.badRequest('A published form needs at least one question');
    const ids = new Set<string>();
    const questions = source.map((question: unknown, index: number) => {
      this.assertObject(question, `questions[${index}]`);
      this.assertKeys(question, ['id', 'prompt', 'type', 'required', 'choices'], `questions[${index}]`);
      const { id, prompt, type, required } = question;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
        this.badRequest(`questions[${index}].id is invalid`);
      }
      if (ids.has(id)) this.badRequest('Question IDs must be unique');
      ids.add(id);
      if (typeof prompt !== 'string' || prompt.length > 500 || (requireComplete && !prompt.trim())) {
        this.badRequest(`questions[${index}].prompt is invalid`);
      }
      const types = ['SHORT_ANSWER', 'PARAGRAPH', 'MULTIPLE_CHOICE', 'CHECKBOXES', 'EMAIL', 'NUMBER', 'FILE_UPLOAD'];
      if (typeof type !== 'string' || !types.includes(type)) this.badRequest(`questions[${index}].type is invalid`);
      if (typeof required !== 'boolean') this.badRequest(`questions[${index}].required must be boolean`);
      const choiceType = type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES';
      if (!choiceType && Object.prototype.hasOwnProperty.call(question, 'choices')) {
        this.badRequest(`questions[${index}] cannot have choices for this type`);
      }
      if (!choiceType) return { id, prompt: prompt.trim(), type, required };
      const choices = question.choices ?? [];
      if (!Array.isArray(choices) || choices.length > MAX_CHOICES || (requireComplete && choices.length === 0)) {
        this.badRequest(`questions[${index}] must have between 1 and ${MAX_CHOICES} choices when published`);
      }
      const cleanChoices = choices.map((choice: unknown) => {
        if (typeof choice !== 'string' || choice.length > 200 || (requireComplete && !choice.trim())) {
          this.badRequest(`questions[${index}].choices are invalid`);
        }
        return choice.trim();
      });
      const nonBlank = cleanChoices.filter(Boolean);
      if (new Set(nonBlank).size !== nonBlank.length) this.badRequest('Question choices must be unique');
      return { id, prompt: prompt.trim(), type, required, choices: cleanChoices };
    });
    const clean = { questions };
    this.assertJsonSize(clean, 'schema');
    return clean as Prisma.InputJsonValue;
  }

  private async authorize(workspaceId: string, userId: string, write = false) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (member.status !== WorkspaceMemberStatus.ACTIVE) throw new NotFoundException('Workspace not found');
    if (write) await this.subscriptions.requireWriteAccess(workspaceId);
    return member;
  }

  private async ownedForm(workspaceId: string, formId: string) {
    const form = await this.prisma.workspaceForm.findFirst({ where: { workspaceId, id: formId } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private ensureManager(role: WorkspaceRole, ownerUserId: string, userId: string) {
    if (role !== WorkspaceRole.OWNER && role !== WorkspaceRole.ADMIN && ownerUserId !== userId) {
      throw new ForbiddenException('You can only manage forms you created');
    }
  }

  async list(workspaceId: string, userId: string) {
    await this.authorize(workspaceId, userId);
    return this.prisma.workspaceForm.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true, workspaceId: true, ownerUserId: true, title: true, description: true, schema: true,
        publishedAt: true, revokedAt: true, createdAt: true, updatedAt: true, tokenHash: true,
        _count: { select: { responses: true } },
      },
    }).then((forms) => forms.map(({ tokenHash, _count, ownerUserId: _ownerUserId, ...form }) => ({
      ...form, shareActive: Boolean(tokenHash && form.publishedAt && !form.revokedAt), responseCount: _count.responses,
    })));
  }

  async create(workspaceId: string, userId: string, dto: CreateWorkspaceFormDto) {
    await this.authorize(workspaceId, userId, true);
    const schema = this.validateSchema(dto.schema, dto.published === true);
    return this.prisma.workspaceForm.create({
      data: {
        workspaceId, ownerUserId: userId, title: dto.title.trim(),
        description: dto.description?.trim() || null, schema,
        publishedAt: dto.published ? new Date() : null,
      },
      select: {
        id: true, workspaceId: true, ownerUserId: true, title: true, description: true, schema: true,
        publishedAt: true, createdAt: true, updatedAt: true,
      },
    }).then((form) => ({ ...form, shareActive: false, responseCount: 0 }));
  }

  async update(workspaceId: string, userId: string, formId: string, dto: UpdateWorkspaceFormDto) {
    const member = await this.authorize(workspaceId, userId, true);
    const current = await this.ownedForm(workspaceId, formId);
    this.ensureManager(member.role, current.ownerUserId, userId);
    if (!Object.keys(dto).length) this.badRequest('At least one field must be provided');
    const nextPublished = dto.published ?? Boolean(current.publishedAt);
    const schema = dto.schema === undefined && dto.published !== true
      ? undefined
      : this.validateSchema(dto.schema ?? current.schema, nextPublished);
    const now = new Date();
    await this.prisma.workspaceForm.updateMany({
      where: { id: formId, workspaceId, updatedAt: current.updatedAt },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(schema !== undefined ? { schema } : {}),
        ...(dto.published !== undefined || dto.schema !== undefined
          ? { publishedAt: nextPublished ? current.publishedAt ?? now : null }
          : {}),
        updatedAt: now,
      },
    }).then((result) => {
      if (!result.count) this.badRequest('Form changed while it was being updated; retry');
    });
    return this.get(workspaceId, userId, formId);
  }

  async get(workspaceId: string, userId: string, formId: string) {
    await this.authorize(workspaceId, userId);
    const form = await this.ownedForm(workspaceId, formId);
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    this.ensureManager(member.role, form.ownerUserId, userId);
    const responseCount = await this.prisma.workspaceFormResponse.count({ where: { workspaceId, formId } });
    const { tokenHash, ownerUserId: _ownerUserId, ...safeForm } = form;
    return { ...safeForm, shareActive: Boolean(tokenHash && form.publishedAt && !form.revokedAt), responseCount };
  }

  async delete(workspaceId: string, userId: string, formId: string) {
    const member = await this.authorize(workspaceId, userId, true);
    const form = await this.ownedForm(workspaceId, formId);
    this.ensureManager(member.role, form.ownerUserId, userId);
    await this.prisma.workspaceForm.delete({ where: { id: formId } });
  }

  async share(workspaceId: string, userId: string, formId: string) {
    const member = await this.authorize(workspaceId, userId, true);
    const form = await this.ownedForm(workspaceId, formId);
    this.ensureManager(member.role, form.ownerUserId, userId);
    this.validateSchema(form.schema, true);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const result = await this.prisma.workspaceForm.updateMany({
      where: { workspaceId, id: formId, updatedAt: form.updatedAt },
      data: { tokenHash, revokedAt: null, publishedAt: form.publishedAt ?? now, updatedAt: now },
    });
    if (!result.count) this.badRequest('Form changed while it was being published; retry');
    return { token };
  }

  async revoke(workspaceId: string, userId: string, formId: string) {
    const member = await this.authorize(workspaceId, userId, true);
    const form = await this.ownedForm(workspaceId, formId);
    this.ensureManager(member.role, form.ownerUserId, userId);
    await this.prisma.workspaceForm.update({
      where: { id: formId }, data: { tokenHash: null, revokedAt: new Date(), publishedAt: null },
    });
  }

  async responses(workspaceId: string, userId: string, formId: string) {
    const member = await this.authorize(workspaceId, userId);
    const form = await this.ownedForm(workspaceId, formId);
    this.ensureManager(member.role, form.ownerUserId, userId);
    return this.prisma.workspaceFormResponse.findMany({
      where: { workspaceId, formId },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, respondentName: true, respondentEmail: true, answers: true, submittedAt: true },
    });
  }

  private async publicForm(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('Form not found');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const form = await this.prisma.workspaceForm.findFirst({
      where: { tokenHash, publishedAt: { not: null }, revokedAt: null },
      select: {
        id: true, title: true, description: true, schema: true, workspaceId: true,
        workspace: { select: { ownerUserId: true } },
      },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async getPublic(token: string) {
    const { workspaceId: _workspaceId, workspace: _workspace, ...form } = await this.publicForm(token);
    return form;
  }

  async uploadPublicFile(token: string, questionId: string, file: UploadInput) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FORM_UPLOAD_BYTES) {
      throw new BadRequestException('Form files must be between 1 byte and 5 MiB');
    }
    const form = await this.publicForm(token);
    const schema = this.validateSchema(form.schema, true) as unknown as { questions: JsonRecord[] };
    const question = schema.questions.find((item) => item.id === questionId);
    if (!question || question.type !== 'FILE_UPLOAD') throw new NotFoundException('Form upload question not found');
    const prefix = await readUploadPrefix(file, 8);
    const detected = prefix.subarray(0, 5).toString('ascii') === '%PDF-'
      ? { mimeType: 'application/pdf', extension: /\.(pdf)$/i }
      : prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? { mimeType: 'image/png', extension: /\.(png)$/i }
        : prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff
          ? { mimeType: 'image/jpeg', extension: /\.(jpe?g)$/i }
          : null;
    if (!detected || !detected.extension.test(file.originalname)) {
      throw new BadRequestException('Only matching PDF, PNG, and JPEG uploads are accepted');
    }
    const stored = await this.workspaceStorage.upload(
      form.workspaceId, form.workspace.ownerUserId,
      { ...file, mimetype: detected.mimeType }, undefined,
    );
    try {
      await this.prisma.workspaceFormUpload.create({
        data: {
          workspaceId: form.workspaceId, formId: form.id, questionId, fileId: stored.id,
        },
      });
    } catch (error) {
      await this.workspaceStorage.deleteFile(form.workspaceId, form.workspace.ownerUserId, stored.id).catch(() => undefined);
      throw error;
    }
    return {
      fileId: stored.id, originalName: stored.originalName, mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    };
  }

  async submit(token: string, dto: SubmitWorkspaceFormDto) {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      this.badRequest('A valid respondent name and email are required');
    }
    this.assertObject(dto.answers, 'answers');
    this.assertJsonSize(dto.answers, 'answers');
    const form = await this.publicForm(token);
    const schema = this.validateSchema(form.schema, true) as unknown as { questions: JsonRecord[] };
    const questionMap = new Map(schema.questions.map((question) => [question.id as string, question]));
    const answers: JsonRecord = Object.create(null) as JsonRecord;
    for (const [id, input] of Object.entries(dto.answers)) {
      const question = questionMap.get(id);
      if (!question) this.badRequest('Answer references an unknown question');
      const type = question.type;
      if (type === 'SHORT_ANSWER' || type === 'PARAGRAPH' || type === 'EMAIL') {
        const max = type === 'PARAGRAPH' ? 10000 : type === 'EMAIL' ? 320 : 2000;
        if (typeof input !== 'string' || input.length > max) this.badRequest('Text answer is invalid or too long');
        const value = input.trim();
        if (type === 'EMAIL' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          this.badRequest('Email answer is invalid');
        }
        answers[id] = type === 'EMAIL' ? value.toLowerCase() : value;
      } else if (type === 'NUMBER') {
        if (typeof input !== 'number' || !Number.isFinite(input) || Math.abs(input) > 1_000_000_000_000) {
          this.badRequest('Numeric answer is invalid');
        }
        answers[id] = input;
      } else if (type === 'FILE_UPLOAD') {
        if (typeof input !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
          this.badRequest('File upload answer is invalid');
        }
        const upload = await this.prisma.workspaceFormUpload.findFirst({
          where: {
            workspaceId: form.workspaceId, formId: form.id, questionId: id, fileId: input,
            responseId: null,
            file: { is: { status: 'READY', deletedAt: null } },
          },
          select: { fileId: true },
        });
        if (!upload) this.badRequest('File upload answer is not available for this form question');
        answers[id] = input;
      } else if (type === 'MULTIPLE_CHOICE') {
        if (typeof input !== 'string' || !(question.choices as string[]).includes(input)) {
          this.badRequest('Multiple-choice answer is invalid');
        }
        answers[id] = input;
      } else {
        if (!Array.isArray(input) || input.length > MAX_CHOICES
          || input.some((choice) => typeof choice !== 'string' || !(question.choices as string[]).includes(choice))
          || new Set(input).size !== input.length) this.badRequest('Checkbox answer is invalid');
        answers[id] = input;
      }
    }
    for (const question of schema.questions) {
      const answer = answers[question.id as string];
      if (question.required && (answer === undefined || answer === '' || (Array.isArray(answer) && !answer.length))) {
        this.badRequest('A required answer is missing');
      }
    }
    this.assertJsonSize(answers, 'answers');
    const fileIds = Object.entries(answers)
      .filter(([questionId]) => questionMap.get(questionId)?.type === 'FILE_UPLOAD')
      .map(([, fileId]) => fileId as string);
    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspaceFormResponse.create({
        data: {
          workspaceId: form.workspaceId, formId: form.id, respondentName: name, respondentEmail: email,
          answers: answers as Prisma.InputJsonValue,
        },
        select: { id: true, submittedAt: true },
      });
      if (fileIds.length) {
        const attached = await tx.workspaceFormUpload.updateMany({
          where: { workspaceId: form.workspaceId, formId: form.id, fileId: { in: fileIds }, responseId: null },
          data: { responseId: created.id },
        });
        if (attached.count !== fileIds.length) this.badRequest('A form upload was already submitted');
      }
      return created;
    });
    return { id: response.id, submittedAt: response.submittedAt };
  }
}
