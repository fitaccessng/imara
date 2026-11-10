import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StoredFileStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class FileSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectStorageService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private createToken() {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
  }

  private tokenHash(token: string): string {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('Share not found');
    return createHash('sha256').update(token).digest('hex');
  }

  async createPersonal(userId: string, fileId: string) {
    const { token, tokenHash } = this.createToken();
    const share = await this.prisma.$transaction(async (tx) => {
      const file = await tx.storedFile.findFirst({
        where: {
          id: fileId,
          userId,
          workspaceId: null,
          eventId: null,
          status: StoredFileStatus.READY,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('File not found');
      return tx.publicFileShare.create({
        data: { fileId, tokenHash },
        select: { id: true, createdAt: true },
      });
    });
    return { id: share.id, token, createdAt: share.createdAt };
  }

  async listPersonal(userId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, eventId: null },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return this.prisma.publicFileShare.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, revokedAt: true },
    });
  }

  async revokePersonal(userId: string, fileId: string, shareId: string): Promise<void> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, eventId: null },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');
    const revoked = await this.prisma.publicFileShare.updateMany({
      where: { id: shareId, fileId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!revoked.count) {
      const share = await this.prisma.publicFileShare.findFirst({
        where: { id: shareId, fileId },
        select: { id: true },
      });
      if (!share) throw new NotFoundException('Share not found');
    }
  }

  private async authorizeWorkspaceFile(
    workspaceId: string,
    userId: string,
    fileId: string,
    requireReady = false,
  ) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        workspaceId,
        ...(requireReady ? { status: StoredFileStatus.READY, deletedAt: null } : {}),
      },
      select: { id: true, folderId: true, originalName: true },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.folderId) {
      await this.workspaces.authorizeFolder(workspaceId, userId, file.folderId, 'shareFiles');
    } else if (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async createWorkspace(workspaceId: string, userId: string, fileId: string) {
    await this.authorizeWorkspaceFile(workspaceId, userId, fileId, true);
    const { token, tokenHash } = this.createToken();
    const share = await this.prisma.$transaction(async (tx) => {
      const currentFile = await tx.storedFile.findFirst({
        where: { id: fileId, workspaceId, status: StoredFileStatus.READY, deletedAt: null },
        select: { id: true, folderId: true, originalName: true },
      });
      if (!currentFile) throw new NotFoundException('File not found');

      // Re-check access immediately before creating the share.
      const currentMember = await this.workspaces.authorizeWorkspace(workspaceId, userId);
      if (currentFile.folderId) {
        await this.workspaces.authorizeFolder(workspaceId, userId, currentFile.folderId, 'shareFiles');
      } else if (currentMember.role !== WorkspaceRole.OWNER && currentMember.role !== WorkspaceRole.ADMIN) {
        throw new NotFoundException('File not found');
      }

      const created = await tx.publicFileShare.create({
        data: { fileId, tokenHash },
        select: { id: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'FILE_SHARE_CREATED',
          targetType: 'PublicFileShare',
          targetId: created.id,
          metadata: { fileId, fileName: currentFile.originalName } satisfies Prisma.InputJsonValue,
        },
      });
      return created;
    });
    return { id: share.id, token, createdAt: share.createdAt };
  }

  async listWorkspace(workspaceId: string, userId: string, fileId: string) {
    await this.authorizeWorkspaceFile(workspaceId, userId, fileId);
    return this.prisma.publicFileShare.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, revokedAt: true },
    });
  }

  async revokeWorkspace(workspaceId: string, userId: string, fileId: string, shareId: string): Promise<void> {
    const file = await this.authorizeWorkspaceFile(workspaceId, userId, fileId);
    await this.prisma.$transaction(async (tx) => {
      const share = await tx.publicFileShare.findFirst({
        where: { id: shareId, fileId },
        select: { id: true, revokedAt: true },
      });
      if (!share) throw new NotFoundException('Share not found');
      if (share.revokedAt) return;

      const revokedAt = new Date();
      const updated = await tx.publicFileShare.updateMany({
        where: { id: shareId, fileId, revokedAt: null },
        data: { revokedAt },
      });
      if (!updated.count) return;
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'FILE_SHARE_REVOKED',
          targetType: 'PublicFileShare',
          targetId: shareId,
          metadata: { fileId, fileName: file.originalName } satisfies Prisma.InputJsonValue,
        },
      });
    });
  }

  private async publicFile(token: string) {
    const tokenHash = this.tokenHash(token);
    const share = await this.prisma.publicFileShare.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        file: {
          status: StoredFileStatus.READY,
          deletedAt: null,
        },
      },
      select: {
        file: {
          select: {
            objectKey: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
          },
        },
      },
    });
    if (!share) throw new NotFoundException('Share not found');
    return share.file;
  }

  async getPublicMetadata(token: string) {
    const file = await this.publicFile(token);
    return {
      name: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
    };
  }

  async downloadPublic(token: string) {
    const file = await this.publicFile(token);
    try {
      return {
        ...(await this.objects.get(file.objectKey)),
        name: file.originalName,
        contentType: file.mimeType,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }
}
