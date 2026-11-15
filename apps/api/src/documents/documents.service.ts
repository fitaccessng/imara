import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PersonalDocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePersonalDocumentDto,
  SignPersonalAgreementDto,
  SubmitPersonalFormDto,
  UpdatePersonalDocumentDto,
} from './documents.dto';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_QUESTIONS = 50;
const MAX_CHOICES = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

type JsonRecord = Record<string, unknown>;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private badRequest(message: string): never {
    throw new BadRequestException(message);
  }

  private assertObject(value: unknown, label: string): asserts value is JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) this.badRequest(`${label} must be an object`);
  }

  private assertKeys(value: JsonRecord, allowed: string[], label: string) {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) this.badRequest(`${label} contains an unsupported field`);
  }

  private assertString(value: unknown, label: string, min: number, max: number) {
    if (typeof value !== 'string' || value.length < min || value.length > max || !value.trim()) {
      this.badRequest(`${label} must be a non-empty string of at most ${max} characters`);
    }
  }

  private assertJsonSize(value: unknown, label: string) {
    try {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_JSON_BYTES) {
        this.badRequest(`${label} must not exceed 64 KB`);
      }
    } catch {
      this.badRequest(`${label} is invalid`);
    }
  }

  private validateContent(
    type: PersonalDocumentType,
    value: unknown,
    requireComplete = false,
  ): Prisma.InputJsonValue {
    this.assertObject(value, 'content');
    let clean: JsonRecord;
    if (type === PersonalDocumentType.FORM) {
      this.assertKeys(value, ['questions'], 'content');
      const sourceQuestions = value.questions ?? [];
      if (!Array.isArray(sourceQuestions) || sourceQuestions.length > MAX_QUESTIONS) {
        this.badRequest(`A form must contain at most ${MAX_QUESTIONS} questions`);
      }
      if (requireComplete && sourceQuestions.length === 0) this.badRequest('A published form needs at least one question');
      const ids = new Set<string>();
      const questions = sourceQuestions.map((question: unknown, index: number) => {
        this.assertObject(question, `questions[${index}]`);
        this.assertKeys(question, ['id', 'prompt', 'type', 'required', 'choices'], `questions[${index}]`);
        this.assertString(question.id, `questions[${index}].id`, 1, 80);
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(question.id as string)) {
          this.badRequest(`questions[${index}].id contains unsupported characters`);
        }
        const prompt = question.prompt ?? '';
        if (typeof prompt !== 'string' || prompt.length > 500) {
          this.badRequest(`questions[${index}].prompt must be at most 500 characters`);
        }
        if (requireComplete && !prompt.trim()) this.badRequest(`questions[${index}].prompt is required before publishing`);
        if (ids.has(question.id as string)) this.badRequest('Question IDs must be unique');
        ids.add(question.id as string);
        if (!['SHORT_ANSWER', 'PARAGRAPH', 'MULTIPLE_CHOICE', 'CHECKBOXES'].includes(String(question.type))) {
          this.badRequest(`questions[${index}].type is invalid`);
        }
        if (typeof question.required !== 'boolean') this.badRequest(`questions[${index}].required must be boolean`);
        const isChoice = question.type === 'MULTIPLE_CHOICE' || question.type === 'CHECKBOXES';
        if (isChoice) {
          const sourceChoices = question.choices ?? [];
          if (!Array.isArray(sourceChoices) || sourceChoices.length > MAX_CHOICES
            || (requireComplete && sourceChoices.length < 1)) {
            this.badRequest(`questions[${index}] must have between 1 and ${MAX_CHOICES} choices when published`);
          }
          const choices = sourceChoices.map((choice: unknown) => {
            if (typeof choice !== 'string' || choice.length > 200) {
              this.badRequest(`questions[${index}].choices must be strings of at most 200 characters`);
            }
            if (requireComplete && !choice.trim()) this.badRequest('Question choices cannot be blank when published');
            return choice.trim();
          });
          const nonBlankChoices = choices.filter(Boolean);
          if (new Set(nonBlankChoices).size !== nonBlankChoices.length) this.badRequest('Question choices must be unique');
          return {
            id: (question.id as string).trim(),
            prompt: prompt.trim(),
            type: question.type as string,
            required: question.required as boolean,
            choices,
          };
        }
        if (hasOwn(question, 'choices')) this.badRequest(`questions[${index}] cannot have choices for this type`);
        return {
          id: (question.id as string).trim(),
          prompt: prompt.trim(),
          type: question.type as string,
          required: question.required as boolean,
        };
      });
      clean = { questions };
    } else if (type === PersonalDocumentType.AGREEMENT) {
      this.assertKeys(value, ['body'], 'content');
      const body = value.body ?? '';
      if (typeof body !== 'string' || body.length > 30_000) {
        this.badRequest('content.body must be a string of at most 30000 characters');
      }
      if (requireComplete && !body.trim()) this.badRequest('content.body is required before publishing');
      clean = { body: body.trim() };
    } else {
      this.assertKeys(value, [
        'businessName', 'customerName', 'customerEmail', 'invoiceNumber',
        'issueDate', 'dueDate', 'currency', 'lineItems', 'note',
      ], 'content');
      const textFields = [
        ['businessName', 160], ['customerName', 160], ['invoiceNumber', 80],
        ['customerEmail', 320], ['issueDate', 10], ['dueDate', 10], ['currency', 3], ['note', 2000],
      ] as const;
      const fields: JsonRecord = {};
      for (const [field, max] of textFields) {
        const fieldValue = value[field] ?? '';
        if (typeof fieldValue !== 'string' || fieldValue.length > max) {
          this.badRequest(`content.${field} must be a string of at most ${max} characters`);
        }
        fields[field] = fieldValue.trim();
      }
      const requiredTextFields = ['businessName', 'customerName', 'customerEmail', 'invoiceNumber', 'issueDate', 'dueDate', 'currency'];
      if (requireComplete && requiredTextFields.some((field) => !(fields[field] as string).trim())) {
        this.badRequest('Complete all required invoice fields before publishing');
      }
      const email = fields.customerEmail as string;
      if (requireComplete && !EMAIL_PATTERN.test(email)) {
        this.badRequest('content.customerEmail must be a valid email address');
      }
      for (const field of ['issueDate', 'dueDate']) {
        const dateValue = fields[field] as string;
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
          ? new Date(`${dateValue}T00:00:00Z`)
          : null;
        if (requireComplete
          && (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateValue)) {
          this.badRequest(`content.${field} must be a valid YYYY-MM-DD date`);
        }
      }
      const currency = fields.currency as string;
      if (requireComplete && !/^[A-Z]{3}$/.test(currency)) {
        this.badRequest('content.currency must be a three-letter uppercase currency code');
      }
      const sourceLineItems = value.lineItems ?? [];
      if (!Array.isArray(sourceLineItems) || sourceLineItems.length > 100
        || (requireComplete && sourceLineItems.length < 1)) {
        this.badRequest('A published invoice must contain between 1 and 100 line items');
      }
      const lineItems = sourceLineItems.map((item: unknown, index: number) => {
        this.assertObject(item, `content.lineItems[${index}]`);
        this.assertKeys(item, ['description', 'quantity', 'unitPrice'], `content.lineItems[${index}]`);
        const description = item.description ?? '';
        if (typeof description !== 'string' || description.length > 500) {
          this.badRequest(`content.lineItems[${index}].description must be a string of at most 500 characters`);
        }
        if (requireComplete && !description.trim()) this.badRequest('Line item descriptions are required before publishing');
        const quantity = item.quantity ?? '';
        const unitPriceInput = item.unitPrice ?? '';
        if (quantity !== '' && (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)) {
          this.badRequest(`content.lineItems[${index}].quantity must be a positive number`);
        }
        if (unitPriceInput !== '' && (typeof unitPriceInput !== 'number' || !Number.isFinite(unitPriceInput) || unitPriceInput < 0 || unitPriceInput > 1_000_000_000)) {
          this.badRequest(`content.lineItems[${index}].unitPrice must be a non-negative number`);
        }
        if (requireComplete && (quantity === '' || unitPriceInput === '')) {
          this.badRequest('Line item quantity and unit price are required before publishing');
        }
        const unitPrice = typeof unitPriceInput === 'number' ? Math.round(unitPriceInput * 100) / 100 : '';
        if (typeof quantity === 'number' && typeof unitPrice === 'number') {
          const lineCents = Math.round(Math.round(unitPrice * 100) * quantity);
          if (!Number.isSafeInteger(lineCents)) this.badRequest('Invoice total is too large');
        }
        return {
          description: description.trim(),
          quantity,
          unitPrice,
        };
      });
      const totalCents = lineItems.reduce((sum, item) => {
        if (typeof item.unitPrice !== 'number' || typeof item.quantity !== 'number') return sum;
        return sum + Math.round(Math.round(item.unitPrice * 100) * item.quantity);
      }, 0);
      if (!Number.isSafeInteger(totalCents)) this.badRequest('Invoice total is too large');
      clean = {
        businessName: fields.businessName,
        customerName: fields.customerName,
        customerEmail: email.toLowerCase(),
        invoiceNumber: fields.invoiceNumber,
        issueDate: fields.issueDate,
        dueDate: fields.dueDate,
        currency: fields.currency,
        lineItems,
        note: fields.note,
      };
    }
    this.assertJsonSize(clean, 'content');
    return clean as Prisma.InputJsonValue;
  }

  private createToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
  }

  private hashToken(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('Document not found');
    return createHash('sha256').update(token).digest('hex');
  }

  private async ownedDocument(ownerId: string, id: string) {
    const document = await this.prisma.personalDocument.findFirst({ where: { id, ownerId } });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async list(ownerId: string) {
    const documents = await this.prisma.personalDocument.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, type: true, title: true, description: true, content: true,
        published: true, publishedAt: true, revokedAt: true, createdAt: true, updatedAt: true,
        tokenHash: true, _count: { select: { responses: true } },
      },
    });
    const agreementCounts = await Promise.all(documents
      .filter((document) => document.type === PersonalDocumentType.AGREEMENT)
      .map(async (document) => [document.id, await this.prisma.personalDocumentResponse.count({
        where: { documentId: document.id, signedAt: { not: null } },
      })] as const));
    const signedCountByDocument = new Map(agreementCounts);
    return documents.map(({ tokenHash, ...document }) => ({
      id: document.id,
      type: document.type,
      title: document.title,
      description: document.description,
      content: document.content,
      published: document.published,
      publishedAt: document.publishedAt,
      shareActive: Boolean(tokenHash && document.published && !document.revokedAt),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      // Agreements count completed signatures; forms count submissions; invoices have no responses.
      responseCount: document.type === PersonalDocumentType.AGREEMENT
        ? signedCountByDocument.get(document.id) ?? 0
        : document.type === PersonalDocumentType.FORM ? document._count.responses : 0,
    }));
  }

  async create(ownerId: string, dto: CreatePersonalDocumentDto) {
    const content = this.validateContent(dto.type, dto.content, dto.published === true);
    const publishedAt = dto.published ? new Date() : null;
    const document = await this.prisma.personalDocument.create({
      data: {
        ownerId, type: dto.type, title: dto.title.trim(),
        description: dto.description?.trim() || null, content,
        published: dto.published ?? false, publishedAt,
      },
      select: {
        id: true, type: true, title: true, description: true, content: true,
        published: true, publishedAt: true, createdAt: true, updatedAt: true,
      },
    });
    return { ...document, shareActive: false, responseCount: 0 };
  }

  async get(ownerId: string, id: string) {
    const document = await this.ownedDocument(ownerId, id);
    const responseCount = document.type === PersonalDocumentType.INVOICE ? 0
      : await this.prisma.personalDocumentResponse.count({
        where: {
          documentId: id,
          signedAt: document.type === PersonalDocumentType.AGREEMENT ? { not: null } : null,
        },
      });
    return {
      id: document.id, type: document.type, title: document.title,
      description: document.description, content: document.content,
      published: document.published, publishedAt: document.publishedAt,
      shareActive: Boolean(document.tokenHash && document.published && !document.revokedAt),
      createdAt: document.createdAt, updatedAt: document.updatedAt, responseCount,
    };
  }

  async update(ownerId: string, id: string, dto: UpdatePersonalDocumentDto) {
    const current = await this.ownedDocument(ownerId, id);
    if (!Object.keys(dto).length) this.badRequest('At least one field must be provided');
    if (dto.type !== undefined && dto.type !== current.type) {
      this.badRequest('Document type cannot be changed after creation');
    }
    const data: Prisma.PersonalDocumentUpdateInput = {};
    if (dto.title !== undefined) {
      this.assertString(dto.title, 'title', 1, 160);
      data.title = dto.title.trim();
    }
    if (dto.description !== undefined) {
      if (dto.description !== null && (typeof dto.description !== 'string' || dto.description.length > 1000)) {
        this.badRequest('description must be at most 1000 characters');
      }
      data.description = typeof dto.description === 'string' ? dto.description.trim() || null : null;
    }
    const nextPublished = dto.published ?? current.published;
    if (dto.content !== undefined || dto.published === true) {
      data.content = this.validateContent(current.type, dto.content ?? current.content, nextPublished);
    }
    if (dto.published !== undefined || dto.content !== undefined) {
      // Editing a draft must not race with a concurrent publish and expose incomplete content.
      data.published = nextPublished;
      data.publishedAt = nextPublished ? current.publishedAt ?? new Date() : null;
    }
    await this.prisma.personalDocument.update({
      where: { id }, data,
      select: {
        id: true, type: true, title: true, description: true, content: true,
        published: true, publishedAt: true, createdAt: true, updatedAt: true,
      },
    });
    return this.get(ownerId, id);
  }

  async delete(ownerId: string, id: string) {
    await this.ownedDocument(ownerId, id);
    await this.prisma.personalDocument.delete({ where: { id } });
  }

  async share(ownerId: string, id: string) {
    const document = await this.ownedDocument(ownerId, id);
    this.validateContent(document.type, document.content, true);
    const { token, tokenHash } = this.createToken();
    const publishedAt = new Date();
    const result = await this.prisma.personalDocument.updateMany({
      where: { id, ownerId, updatedAt: document.updatedAt },
      data: {
        tokenHash, revokedAt: null, published: true, publishedAt, updatedAt: publishedAt,
      },
    });
    if (!result.count) this.badRequest('Document changed while publishing; retry the share action');
    return { token };
  }

  async revokeShare(ownerId: string, id: string) {
    await this.ownedDocument(ownerId, id);
    await this.prisma.personalDocument.update({
      where: { id }, data: { tokenHash: null, revokedAt: new Date(), published: false, publishedAt: null },
    });
  }

  private async publicDocument(token: string) {
    const tokenHash = this.hashToken(token);
    const document = await this.prisma.personalDocument.findFirst({
      where: { tokenHash, published: true, revokedAt: null },
      select: { id: true, type: true, title: true, description: true, content: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async getPublic(token: string) {
    const document = await this.publicDocument(token);
    const content = document.content as JsonRecord;
    let publicContent: JsonRecord = content;
    if (document.type === PersonalDocumentType.INVOICE) {
      let totalCents = 0;
      const lineItems = (content.lineItems as JsonRecord[]).map((item) => {
        const lineCents = Math.round(Math.round(Number(item.unitPrice) * 100) * Number(item.quantity));
        if (!Number.isSafeInteger(lineCents)) throw new NotFoundException('Document not found');
        totalCents += lineCents;
        if (!Number.isSafeInteger(totalCents)) throw new NotFoundException('Document not found');
        return { ...item, total: lineCents / 100 };
      });
      const total = totalCents / 100;
      publicContent = { ...content, lineItems, total };
    }
    return {
      id: document.id, type: document.type, title: document.title,
      description: document.description, content: publicContent,
    };
  }

  async submitForm(token: string, dto: SubmitPersonalFormDto) {
    this.assertString(dto.name, 'name', 1, 120);
    if (!EMAIL_PATTERN.test(dto.email) || dto.email.length > 320) {
      this.badRequest('email must be a valid email address');
    }
    this.assertJsonSize(dto.answers, 'answers');
    this.assertObject(dto.answers, 'answers');
    const document = await this.publicDocument(token);
    if (document.type !== PersonalDocumentType.FORM) throw new NotFoundException('Document not found');
    const questions = (document.content as JsonRecord).questions as JsonRecord[];
    const byId = new Map(questions.map((question) => [question.id as string, question]));
    const answers: JsonRecord = Object.create(null) as JsonRecord;
    for (const key of Object.keys(dto.answers)) {
      const question = byId.get(key);
      if (!question) this.badRequest(`Answer references an unknown question`);
      const answer = dto.answers[key];
      if (question.type === 'SHORT_ANSWER' || question.type === 'PARAGRAPH') {
        const max = question.type === 'SHORT_ANSWER' ? 2000 : 10_000;
        if (typeof answer !== 'string' || answer.length > max) this.badRequest('Text answer is invalid or too long');
        answers[key] = answer;
      } else if (question.type === 'MULTIPLE_CHOICE') {
        if (typeof answer !== 'string' || !(question.choices as string[]).includes(answer)) {
          this.badRequest('Multiple-choice answer is invalid');
        }
        answers[key] = answer;
      } else {
        if (!Array.isArray(answer) || answer.length > MAX_CHOICES
          || answer.some((choice) => typeof choice !== 'string' || !(question.choices as string[]).includes(choice))
          || new Set(answer).size !== answer.length) {
          this.badRequest('Checkbox answer is invalid');
        }
        answers[key] = answer;
      }
    }
    for (const question of questions) {
      const answer = answers[question.id as string];
      if (question.required && (answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0))) {
        this.badRequest(`A required answer is missing`);
      }
    }
    this.assertJsonSize(answers, 'answers');
    return this.prisma.personalDocumentResponse.create({
      data: {
        documentId: document.id,
        respondentName: dto.name.trim(),
        respondentEmail: dto.email.trim().toLowerCase(),
        answers: answers as Prisma.InputJsonValue,
      },
      select: { id: true, submittedAt: true },
    });
  }

  async signAgreement(token: string, dto: SignPersonalAgreementDto, context: { ipAddress?: string; userAgent?: string }) {
    if (!dto.consent) this.badRequest('Explicit consent is required to sign');
    this.assertString(dto.name, 'name', 1, 120);
    if (!EMAIL_PATTERN.test(dto.email) || dto.email.length > 320) {
      this.badRequest('email must be a valid email address');
    }
    const document = await this.publicDocument(token);
    if (document.type !== PersonalDocumentType.AGREEMENT) throw new NotFoundException('Document not found');
    const signedAt = new Date();
    const signature = await this.prisma.personalDocumentResponse.create({
      data: {
        documentId: document.id,
        respondentName: dto.name.trim(),
        respondentEmail: dto.email.trim().toLowerCase(),
        consent: true,
        signedAt,
        signedName: dto.name.trim(),
        ipAddress: context.ipAddress?.slice(0, 64),
        userAgent: context.userAgent?.slice(0, 512),
      },
      select: { id: true, submittedAt: true, signedAt: true },
    });
    return signature;
  }

  async responses(ownerId: string, id: string) {
    const document = await this.ownedDocument(ownerId, id);
    if (document.type === PersonalDocumentType.INVOICE) throw new NotFoundException('Document not found');
    return this.prisma.personalDocumentResponse.findMany({
      where: {
        documentId: id,
        signedAt: document.type === PersonalDocumentType.AGREEMENT ? { not: null } : null,
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true, respondentName: true, respondentEmail: true, answers: true,
        submittedAt: true, signedAt: true, signedName: true, consent: true,
      },
    }).then((responses) => responses.map((response) => document.type === PersonalDocumentType.AGREEMENT
      ? {
        id: response.id,
        name: response.respondentName,
        email: response.respondentEmail,
        submittedAt: response.submittedAt,
        signedAt: response.signedAt,
        signedName: response.signedName,
        consent: response.consent,
      }
      : {
        id: response.id,
        name: response.respondentName,
        email: response.respondentEmail,
        answers: response.answers,
        submittedAt: response.submittedAt,
      }));
  }
}
