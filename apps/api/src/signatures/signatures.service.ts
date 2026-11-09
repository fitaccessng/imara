import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalReviewMode,
  Prisma,
  SignatureMethod,
  SignatureRequestStatus,
  SignatureSignerStatus,
  StoredFileStatus,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@prisma/client';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { getMaxUploadBytes } from '../storage/storage.service';
import { WorkspaceStorageService } from '../workspaces/workspace-storage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateSignatureRequestDto, SignSignatureRequestDto } from './signatures.dto';

const CONSENT_TEXT =
  'I knowingly adopt this electronic mark as my signature for this document and consent to electronic records and signatures.';
const SIGNATURE_REQUEST_INCLUDE = {
  signers: { orderBy: { order: 'asc' as const } },
  finalFile: { select: { id: true, originalName: true } },
} satisfies Prisma.SignatureRequestInclude;
type AuditContext = { ipAddress?: string; userAgent?: string };
type SignatureTransaction = Prisma.TransactionClient;

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += data.length;
    if (total > getMaxUploadBytes()) throw new BadRequestException('The PDF exceeds the workspace file size limit');
    chunks.push(data);
  }
  return Buffer.concat(chunks);
}

function safePdfText(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').replace(/\s+/g, ' ').trim().slice(0, 170);
}

@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly workspaceStorage: WorkspaceStorageService,
    private readonly objects: ObjectStorageService,
  ) {}

  private async activeMember(workspaceId: string, userId: string) {
    return this.workspaces.authorizeWorkspace(workspaceId, userId);
  }

  private async requireParticipant(workspaceId: string, requestId: string, userId: string, role: WorkspaceRole) {
    if (role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN) return;
    const request = await this.prisma.signatureRequest.findFirst({
      where: {
        id: requestId,
        workspaceId,
        OR: [
          { createdById: userId },
          { signers: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Signature request not found');
  }

  private async canReadSource(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    folderId: string | null,
  ): Promise<boolean> {
    if (!folderId) return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
    try {
      await this.workspaces.authorizeFolder(workspaceId, userId, folderId, 'downloadFiles');
      return true;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  async listSources(workspaceId: string, userId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const candidates = await this.prisma.storedFile.findMany({
      where: {
        workspaceId,
        status: StoredFileStatus.READY,
        deletedAt: null,
        mimeType: 'application/pdf',
        originalName: { endsWith: '.pdf', mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
    });
    const accessible = [];
    for (const file of candidates) {
      if (await this.canReadSource(workspaceId, userId, member.role, file.folderId)) {
        accessible.push({
          id: file.id,
          name: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes.toString(),
          folderId: file.folderId,
          createdAt: file.createdAt,
        });
      }
    }
    return accessible;
  }

  async listMembers(workspaceId: string, userId: string) {
    await this.activeMember(workspaceId, userId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      orderBy: [{ displayName: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        displayName: true,
        role: true,
        user: { select: { name: true, email: true, emailVerifiedAt: true } },
      },
    });
    return members.map((member) => ({
      id: member.id,
      name: member.displayName?.trim() || member.user.name,
      email: member.user.email,
      emailVerified: Boolean(member.user.emailVerifiedAt),
      role: member.role,
    }));
  }

  private async audit(
    tx: SignatureTransaction,
    workspaceId: string,
    actorId: string,
    action: string,
    requestId: string,
    metadata: Prisma.InputJsonValue,
    context: AuditContext,
  ) {
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        action,
        targetType: 'SignatureRequest',
        targetId: requestId,
        metadata,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private async requestView(workspaceId: string, requestId: string) {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, workspaceId },
      include: SIGNATURE_REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Signature request not found');
    return this.publicRequest(request);
  }

  private publicRequest<T extends {
    id: string;
    sourceFileId: string;
    sourceName: string;
    mode: ApprovalReviewMode;
    status: SignatureRequestStatus;
    createdById: string;
    createdAt: Date;
    completedAt: Date | null;
    dueAt: Date | null;
    finalFile: { id: string; originalName: string } | null;
    signers: Array<{
      id: string;
      memberId: string;
      userId: string;
      displayName: string;
      email: string;
      order: number;
      status: SignatureSignerStatus;
      method: SignatureMethod | null;
      signedName: string | null;
      signedAt: Date | null;
      consentedAt: Date | null;
      declineReason: string | null;
    }>;
  }>(request: T) {
    return {
      id: request.id,
      sourceFileId: request.sourceFileId,
      sourceName: request.sourceName,
      mode: request.mode,
      status: request.status,
      createdById: request.createdById,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
      dueAt: request.dueAt,
      finalFile: request.finalFile,
      signers: request.signers.map((signer) => ({
        id: signer.id,
        memberId: signer.memberId,
        userId: signer.userId,
        name: signer.displayName,
        email: signer.email,
        order: signer.order,
        status: signer.status,
        method: signer.method,
        signedName: signer.signedName,
        signedAt: signer.signedAt,
        consentedAt: signer.consentedAt,
        declineReason: signer.declineReason,
      })),
    };
  }

  async list(workspaceId: string, userId: string) {
    const member = await this.activeMember(workspaceId, userId);
    const participantFilter = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN
      ? {}
      : { OR: [{ createdById: userId }, { signers: { some: { userId } } }] };
    const staleFinalizations = await this.prisma.signatureRequest.findMany({
      where: {
        workspaceId,
        status: SignatureRequestStatus.FINALIZING,
        updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
        ...participantFilter,
      },
      select: { id: true },
      take: 10,
    });
    for (const item of staleFinalizations) {
      await this.prisma.signatureRequest.updateMany({
        where: { id: item.id, workspaceId, status: SignatureRequestStatus.FINALIZING },
        data: { status: SignatureRequestStatus.PENDING },
      });
    }
    const stuck = await this.prisma.signatureRequest.findMany({
      where: {
        workspaceId,
        status: SignatureRequestStatus.PENDING,
        signers: { every: { status: SignatureSignerStatus.SIGNED } },
        ...participantFilter,
      },
      select: { id: true },
      take: 10,
    });
    for (const item of stuck) await this.tryFinalize(workspaceId, item.id, userId, {});
    const requests = await this.prisma.signatureRequest.findMany({
      where: { workspaceId, ...participantFilter },
      orderBy: { createdAt: 'desc' },
      include: SIGNATURE_REQUEST_INCLUDE,
    });
    return requests.map((request) => this.publicRequest(request));
  }

  async get(workspaceId: string, requestId: string, userId: string) {
    const member = await this.activeMember(workspaceId, userId);
    await this.requireParticipant(workspaceId, requestId, userId, member.role);
    await this.tryFinalize(workspaceId, requestId, userId, {});
    return this.requestView(workspaceId, requestId);
  }

  async create(workspaceId: string, userId: string, dto: CreateSignatureRequestDto, context: AuditContext) {
    const creator = await this.activeMember(workspaceId, userId);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date())) {
      throw new BadRequestException('The signature due date must be in the future');
    }
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: dto.sourceFileId,
        workspaceId,
        status: StoredFileStatus.READY,
        deletedAt: null,
        mimeType: 'application/pdf',
        originalName: { endsWith: '.pdf', mode: 'insensitive' },
      },
      select: { id: true, originalName: true, folderId: true, objectKey: true, sizeBytes: true },
    });
    if (!file || !(await this.canReadSource(workspaceId, userId, creator.role, file.folderId))) {
      throw new NotFoundException('Accessible PDF not found');
    }
    if (file.sizeBytes < 1n || file.sizeBytes > BigInt(getMaxUploadBytes())) {
      throw new BadRequestException('The PDF exceeds the workspace file size limit');
    }
    const selected = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, id: { in: dto.signerMemberIds }, status: WorkspaceMemberStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        displayName: true,
        user: { select: { name: true, email: true, emailVerifiedAt: true } },
      },
    });
    if (selected.length !== dto.signerMemberIds.length) {
      throw new BadRequestException('Every signer must be an active participant in this workspace');
    }
    if (selected.some(({ user }) => !user.emailVerifiedAt)) {
      throw new BadRequestException('Every signer must verify their account email before a request is created');
    }

    const downloaded = await this.workspaceStorage.download(workspaceId, userId, file.id);
    const pdfBytes = await readableToBuffer(downloaded.body);
    if (pdfBytes.length < 8 || pdfBytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('The selected file is not a valid PDF');
    }
    try {
      await PDFDocument.load(pdfBytes);
    } catch {
      throw new BadRequestException('The selected file is not a readable PDF');
    }

    const id = randomUUID();
    const snapshotKey = `${workspaceId}/signatures/${id}/source.pdf`;
    const hash = createHash('sha256').update(pdfBytes).digest('hex');
    await this.objects.put(snapshotKey, pdfBytes, 'application/pdf');
    try {
      await this.prisma.$transaction(async (tx) => {
        const request = await tx.signatureRequest.create({
          data: {
            id,
            workspaceId,
            createdById: userId,
            sourceFileId: file.id,
            sourceName: file.originalName,
            sourceSnapshotKey: snapshotKey,
            sourceSha256: hash,
            mode: dto.mode,
            dueAt,
            signers: {
              create: dto.signerMemberIds.map((memberId, order) => {
                const signer = selected.find((candidate) => candidate.id === memberId)!;
                return {
                  memberId: signer.id,
                  userId: signer.userId,
                  displayName: signer.displayName?.trim() || signer.user.name,
                  email: signer.user.email,
                  order,
                };
              }),
            },
          },
          include: { signers: { select: { id: true, userId: true } } },
        });
        if (dueAt) {
          await tx.reminder.createMany({
            data: request.signers.map((signer) => ({
              workspaceId,
              createdById: userId,
              assignedToId: signer.userId,
              signatureSignerId: signer.id,
              title: `Signature due: ${file.originalName}`,
              dueAt,
              nextDueAt: dueAt,
              recurrence: 'ONCE',
            })),
          });
        }
        await this.audit(tx, workspaceId, userId, 'SIGNATURE_REQUEST_CREATED', id, {
          sourceFileId: file.id,
          sourceName: file.originalName,
          sourceSha256: hash,
          mode: dto.mode,
          signerCount: selected.length,
          signerMemberIds: dto.signerMemberIds,
        }, context);
        const notifiedSigners = dto.mode === ApprovalReviewMode.SEQUENTIAL ? selected.slice(0, 1) : selected;
        await tx.notification.createMany({
          data: notifiedSigners.map((signer) => ({
            workspaceId,
            userId: signer.userId,
            type: 'SIGNATURE_REQUEST_ASSIGNED',
            message: `${creator.workspace.name}: your signature is requested for ${file.originalName}`,
            metadata: { signatureRequestId: request.id, sourceName: file.originalName },
          })),
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      try {
        await this.objects.delete(snapshotKey);
      } catch (cleanupError) {
        this.logger.error(
          `Could not remove source snapshot for failed signature request ${id}: ${cleanupError instanceof Error ? cleanupError.message : 'unknown error'}`,
        );
      }
      throw error;
    }
    return this.requestView(workspaceId, id);
  }

  async getDocument(workspaceId: string, requestId: string, userId: string, final: boolean) {
    const member = await this.activeMember(workspaceId, userId);
    await this.requireParticipant(workspaceId, requestId, userId, member.role);
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, workspaceId },
      select: { id: true, status: true, sourceName: true, sourceSnapshotKey: true, finalFileId: true },
    });
    if (!request) throw new NotFoundException('Signature request not found');
    if (final) {
      if (request.status !== SignatureRequestStatus.COMPLETED || !request.finalFileId) {
        throw new ConflictException('The signed PDF is not ready yet');
      }
      const file = await this.prisma.storedFile.findFirst({
        where: { id: request.finalFileId, workspaceId, status: StoredFileStatus.READY },
        select: { objectKey: true, originalName: true },
      });
      if (!file) throw new NotFoundException('The signed PDF is not available');
      return { ...(await this.objects.get(file.objectKey)), name: file.originalName };
    }
    return {
      ...(await this.objects.get(request.sourceSnapshotKey)),
      name: request.sourceName,
    };
  }

  private async signerForAction(
    tx: SignatureTransaction,
    workspaceId: string,
    requestId: string,
    userId: string,
  ) {
    const request = await tx.signatureRequest.findFirst({
      where: { id: requestId, workspaceId },
      include: { signers: { orderBy: { order: 'asc' } } },
    });
    if (!request) throw new NotFoundException('Signature request not found');
    const signer = request.signers.find((item) => item.userId === userId);
    if (!signer) throw new ForbiddenException('You are not assigned to this signature request');
    return { request, signer };
  }

  private async prepareSignature(dto: SignSignatureRequestDto, accountName: string) {
    if (dto.consent !== true) throw new BadRequestException('Explicit electronic signature consent is required');
    if (dto.method === SignatureMethod.TYPED) {
      const name = dto.signedName?.replace(/\s+/g, ' ').trim();
      if (!name) throw new BadRequestException('Enter your account name to apply a typed signature');
      if (name.localeCompare(accountName.trim().replace(/\s+/g, ' '), undefined, { sensitivity: 'accent' }) !== 0) {
        throw new BadRequestException('Your typed signature must match your account name');
      }
      return { method: SignatureMethod.TYPED, signedName: name, signaturePng: null };
    }
    if (!dto.signaturePng) throw new BadRequestException('Draw your signature before signing');
    const encoded = dto.signaturePng.slice('data:image/png;base64,'.length);
    const png = Buffer.from(encoded, 'base64');
    const validBase64 = png.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '');
    if (!validBase64 || png.length < 32 || png.length > 512_000
      || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new BadRequestException('The drawn signature must be a valid PNG under 500 KB');
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (!width || !height || width > 4096 || height > 1024 || width * height > 4_194_304) {
      throw new BadRequestException('The drawn signature image dimensions are too large');
    }
    try {
      await (await PDFDocument.create()).embedPng(png);
    } catch {
      throw new BadRequestException('The drawn signature must be a valid PNG image');
    }
    return { method: SignatureMethod.DRAWN, signedName: accountName, signaturePng: dto.signaturePng };
  }

  async sign(
    workspaceId: string,
    requestId: string,
    userId: string,
    dto: SignSignatureRequestDto,
    context: AuditContext,
  ) {
    await this.activeMember(workspaceId, userId);
    await this.tryFinalize(workspaceId, requestId, userId, context);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt) throw new ForbiddenException('Verify your account email before signing');
    const signature = await this.prepareSignature(dto, user.name);
    let finalizationClaimed = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        const { request, signer } = await this.signerForAction(tx, workspaceId, requestId, userId);
        if (request.status !== SignatureRequestStatus.PENDING || signer.status !== SignatureSignerStatus.PENDING) {
          throw new ConflictException('This signature request is no longer awaiting your signature');
        }
        if (request.mode === ApprovalReviewMode.SEQUENTIAL) {
          const next = request.signers.find((item) => item.status === SignatureSignerStatus.PENDING);
          if (!next || next.id !== signer.id) {
            throw new ConflictException('The previous signer must sign before you can sign');
          }
        }
        const signedAt = new Date();
        const requestStillPending = await tx.signatureRequest.updateMany({
          where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
          data: { updatedAt: signedAt },
        });
        if (!requestStillPending.count) throw new ConflictException('This signature request is no longer pending');
        const signerStillPending = await tx.signatureSigner.updateMany({
          where: { id: signer.id, requestId, status: SignatureSignerStatus.PENDING },
          data: {
            status: SignatureSignerStatus.SIGNED,
            method: signature.method,
            signedName: signature.signedName,
            signaturePng: signature.signaturePng,
            signedAt,
            consentText: CONSENT_TEXT,
            consentedAt: signedAt,
            consentedEmail: user.email,
            consentIp: context.ipAddress,
          },
        });
        if (!signerStillPending.count) throw new ConflictException('Your signature has already been recorded');
        await tx.reminder.updateMany({
          where: { signatureSignerId: signer.id, cancelledAt: null },
          data: { completedAt: signedAt, nextDueAt: null },
        });
        await this.audit(tx, workspaceId, userId, 'SIGNATURE_SIGNED', requestId, {
          memberId: signer.memberId,
          method: signature.method,
          signedName: signature.signedName,
          consentText: CONSENT_TEXT,
          consentedEmail: user.email,
          signedAt: signedAt.toISOString(),
          sourceSha256: request.sourceSha256,
        }, context);
        const allSigned = request.signers.every((item) =>
          item.id === signer.id || item.status === SignatureSignerStatus.SIGNED);
        if (allSigned) {
          const claimed = await tx.signatureRequest.updateMany({
            where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
            data: { status: SignatureRequestStatus.FINALIZING },
          });
          finalizationClaimed = claimed.count === 1;
        } else if (request.mode === ApprovalReviewMode.SEQUENTIAL) {
          const nextSigner = request.signers.find(
            (item) => item.order > signer.order && item.status === SignatureSignerStatus.PENDING,
          );
          if (nextSigner) {
            await tx.notification.create({
              data: {
                workspaceId,
                userId: nextSigner.userId,
                type: 'SIGNATURE_REQUEST_ASSIGNED',
                message: `Your signature is next for ${request.sourceName}`,
                metadata: { signatureRequestId: requestId, sourceName: request.sourceName },
              },
            });
          }
        }
        if (request.createdById !== userId) {
          await tx.notification.create({
            data: {
              workspaceId,
              userId: request.createdById,
              type: 'SIGNATURE_PROGRESS',
              message: `A signer completed ${request.sourceName}`,
              metadata: { signatureRequestId: requestId, signerUserId: userId },
            },
          });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The request changed while signing. Please retry.');
      }
      throw error;
    }
    if (finalizationClaimed) await this.finalizeClaimed(workspaceId, requestId, userId, context);
    return this.requestView(workspaceId, requestId);
  }

  async decline(
    workspaceId: string,
    requestId: string,
    userId: string,
    reason: string | undefined,
    context: AuditContext,
  ) {
    await this.activeMember(workspaceId, userId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const { request, signer } = await this.signerForAction(tx, workspaceId, requestId, userId);
        if (request.status !== SignatureRequestStatus.PENDING || signer.status !== SignatureSignerStatus.PENDING) {
          throw new ConflictException('This signature request can no longer be declined');
        }
        const declined = await tx.signatureRequest.updateMany({
          where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
          data: { status: SignatureRequestStatus.DECLINED },
        });
        if (!declined.count) throw new ConflictException('This signature request can no longer be declined');
        const signerDeclined = await tx.signatureSigner.updateMany({
          where: { id: signer.id, requestId, status: SignatureSignerStatus.PENDING },
          data: { status: SignatureSignerStatus.DECLINED, declineReason: reason?.trim() || null },
        });
        if (!signerDeclined.count) throw new ConflictException('Your signature response has already been recorded');
        await tx.reminder.updateMany({
          where: { signatureSigner: { requestId }, cancelledAt: null },
          data: { cancelledAt: new Date(), nextDueAt: null },
        });
        await this.audit(tx, workspaceId, userId, 'SIGNATURE_DECLINED', requestId, {
          memberId: signer.memberId,
          reason: reason?.trim() || null,
        }, context);
        if (request.createdById !== userId) {
          await tx.notification.create({
            data: {
              workspaceId,
              userId: request.createdById,
              type: 'SIGNATURE_DECLINED',
              message: `A signer declined ${request.sourceName}`,
              metadata: { signatureRequestId: requestId, signerUserId: userId },
            },
          });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The request changed while declining. Please retry.');
      }
      throw error;
    }
    return this.requestView(workspaceId, requestId);
  }

  async cancel(workspaceId: string, requestId: string, userId: string, context: AuditContext) {
    const member = await this.activeMember(workspaceId, userId);
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, workspaceId },
      select: { id: true, createdById: true, status: true },
    });
    if (!request) throw new NotFoundException('Signature request not found');
    if (request.createdById !== userId && member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only the request creator or a workspace administrator may cancel');
    }
    if (request.status !== SignatureRequestStatus.PENDING) {
      throw new ConflictException('Only pending signature requests can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.signatureRequest.updateMany({
        where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
        data: { status: SignatureRequestStatus.CANCELLED },
      });
      if (!changed.count) throw new ConflictException('The signature request changed; refresh and try again');
      await this.audit(tx, workspaceId, userId, 'SIGNATURE_REQUEST_CANCELLED', requestId, {}, context);
      await tx.reminder.updateMany({
        where: { signatureSigner: { requestId }, cancelledAt: null },
        data: { cancelledAt: new Date(), nextDueAt: null },
      });
      const requestSigners = await tx.signatureSigner.findMany({
        where: { requestId, status: SignatureSignerStatus.PENDING },
        select: { userId: true },
      });
      await tx.notification.createMany({
        data: requestSigners.map(({ userId: signerUserId }) => ({
          workspaceId,
          userId: signerUserId,
          type: 'SIGNATURE_REQUEST_CANCELLED',
          message: 'A signature request was cancelled',
          metadata: { signatureRequestId: requestId },
        })),
      });
    });
    return this.requestView(workspaceId, requestId);
  }

  private async tryFinalize(workspaceId: string, requestId: string, actorId: string, context: AuditContext) {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
      include: { signers: { select: { status: true } } },
    });
    if (!request?.signers.length || request.signers.some((item) => item.status !== SignatureSignerStatus.SIGNED)) return;
    const claimed = await this.prisma.signatureRequest.updateMany({
      where: { id: requestId, workspaceId, status: SignatureRequestStatus.PENDING },
      data: { status: SignatureRequestStatus.FINALIZING },
    });
    if (claimed.count) await this.finalizeClaimed(workspaceId, requestId, actorId, context);
  }

  private async finalizeClaimed(workspaceId: string, requestId: string, actorId: string, context: AuditContext) {
    let uploadedFileId: string | undefined;
    try {
      const request = await this.prisma.signatureRequest.findFirst({
        where: { id: requestId, workspaceId, status: SignatureRequestStatus.FINALIZING },
        include: {
          signers: { orderBy: { order: 'asc' } },
          finalFile: { select: { id: true } },
          sourceFile: { select: { folderId: true } },
        },
      });
      if (!request) return;
      let finalFileId = request.finalFileId ?? undefined;
      if (!finalFileId) {
        const source = await this.objects.get(request.sourceSnapshotKey);
        const sourceBytes = await readableToBuffer(source.body);
        if (createHash('sha256').update(sourceBytes).digest('hex') !== request.sourceSha256) {
          throw new ConflictException('The preserved source PDF failed its integrity check');
        }
        const pdf = await PDFDocument.load(sourceBytes);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
        const completedAt = new Date();
        const pageWidth = 595.28;
        const pageHeight = 841.89;

        for (let offset = 0; offset < request.signers.length; offset += 4) {
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawText(offset === 0 ? 'Electronic signature record' : 'Electronic signature record (continued)', {
            x: 48, y: pageHeight - 55, size: 19, font: bold, color: rgb(0.08, 0.22, 0.18),
          });
          if (offset === 0) {
            page.drawText(`Document: ${safePdfText(request.sourceName)}`, { x: 48, y: pageHeight - 82, size: 9, font });
            page.drawText(`SHA-256: ${request.sourceSha256}`, { x: 48, y: pageHeight - 98, size: 8, font });
            page.drawText(`Signing order: ${request.mode.toLowerCase()}`, { x: 48, y: pageHeight - 114, size: 9, font });
            page.drawText(`Completed: ${completedAt.toISOString()}`, { x: 48, y: pageHeight - 130, size: 9, font });
          }
          const firstY = offset === 0 ? pageHeight - 168 : pageHeight - 94;
          for (const [index, signer] of request.signers.slice(offset, offset + 4).entries()) {
            const y = firstY - index * 148;
            page.drawLine({ start: { x: 48, y: y + 11 }, end: { x: pageWidth - 48, y: y + 11 }, thickness: 0.5, color: rgb(0.82, 0.85, 0.83) });
            page.drawText(`${signer.order + 1}. ${safePdfText(signer.signedName ?? signer.displayName)}`, {
              x: 48, y: y - 10, size: 12, font: italic,
            });
            page.drawText(`Verified account email: ${safePdfText(signer.consentedEmail ?? signer.email)}`, {
              x: 48, y: y - 27, size: 9, font,
            });
            page.drawText(`Signed: ${signer.signedAt?.toISOString() ?? '—'} | Method: ${signer.method?.toLowerCase() ?? '—'}`, {
              x: 48, y: y - 43, size: 9, font,
            });
            page.drawText(`Consent recorded: ${signer.consentedAt?.toISOString() ?? '—'}`, {
              x: 48, y: y - 59, size: 8, font,
            });
            if (signer.method === SignatureMethod.DRAWN && signer.signaturePng) {
              const encoded = signer.signaturePng.slice('data:image/png;base64,'.length);
              const image = await pdf.embedPng(Buffer.from(encoded, 'base64'));
              const fitted = image.scale(Math.min(1, 200 / image.width, 55 / image.height));
              page.drawImage(image, { x: 330, y: y - 60, width: fitted.width, height: fitted.height });
            } else {
              page.drawText(safePdfText(signer.signedName ?? signer.displayName), {
                x: 330, y: y - 45, size: 16, font: italic, color: rgb(0.1, 0.2, 0.4),
              });
            }
          }
          page.drawText('This page is appended by IMARA to preserve the signing record. It does not represent a qualified electronic signature.', {
            x: 48, y: 28, size: 7, font, color: rgb(0.35, 0.38, 0.36),
          });
        }

        const auditEvents = await this.prisma.auditLog.findMany({
          where: { workspaceId, targetType: 'SignatureRequest', targetId: requestId },
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { name: true } } },
        });
        const auditPage = pdf.addPage([pageWidth, pageHeight]);
        auditPage.drawText('Signing audit trail', { x: 48, y: pageHeight - 55, size: 19, font: bold, color: rgb(0.08, 0.22, 0.18) });
        let auditY = pageHeight - 90;
        for (const event of auditEvents.slice(0, 30)) {
          auditPage.drawText(`${event.createdAt.toISOString()}  ${event.action}  ${safePdfText(event.actor?.name ?? 'Account unavailable')}`, {
            x: 48, y: auditY, size: 8, font,
          });
          auditY -= 18;
        }
        auditPage.drawText(`${completedAt.toISOString()}  SIGNATURE_REQUEST_FINALIZED`, { x: 48, y: auditY, size: 8, font });
        auditPage.drawText(`Source PDF SHA-256: ${request.sourceSha256}`, { x: 48, y: 28, size: 7, font });

        const output = Buffer.from(await pdf.save());
        const outputName = `${request.sourceName.replace(/\.pdf$/i, '').slice(0, 220)}-signed.pdf`;
        const uploaded = await this.workspaceStorage.uploadGenerated(
          workspaceId,
          actorId,
          outputName,
          output,
          request.sourceFile.folderId,
        );
        uploadedFileId = uploaded.id;
        finalFileId = uploaded.id;
        const linked = await this.prisma.signatureRequest.updateMany({
          where: { id: requestId, workspaceId, status: SignatureRequestStatus.FINALIZING, finalFileId: null },
          data: { finalFileId },
        });
        if (!linked.count) throw new ConflictException('Unable to attach the generated signed PDF');
      }

      const completedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.signatureRequest.updateMany({
          where: { id: requestId, workspaceId, status: SignatureRequestStatus.FINALIZING },
          data: { status: SignatureRequestStatus.COMPLETED, completedAt, finalFileId },
        });
        if (!changed.count) throw new ConflictException('Signature finalization state changed');
        await this.audit(tx, workspaceId, actorId, 'SIGNATURE_REQUEST_FINALIZED', requestId, {
          finalFileId,
          sourceSha256: request.sourceSha256,
          completedAt: completedAt.toISOString(),
        }, context);
      });
    } catch (error) {
      try {
        await this.prisma.signatureRequest.updateMany({
          where: { id: requestId, workspaceId, status: SignatureRequestStatus.FINALIZING },
          data: {
            status: SignatureRequestStatus.PENDING,
            ...(uploadedFileId ? { finalFileId: uploadedFileId } : {}),
          },
        });
      } catch (recoveryError) {
        this.logger.error(
          `Could not recover signature finalization ${requestId}: ${recoveryError instanceof Error ? recoveryError.message : 'unknown error'}`,
        );
        throw new AggregateError([error, recoveryError], 'Signature finalization and recovery both failed');
      }
      throw error;
    }
  }
}
