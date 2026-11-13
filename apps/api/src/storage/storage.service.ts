import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventStatus, FileCategory, Prisma, StoredFileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { getPlanLimitMessage } from '../subscriptions/plan-entitlements';
import { UpdateFileOrganizationDto } from './storage.dto';
import { assertPlanFileSize } from '../subscriptions/plan-entitlements';

const RESERVATION_TTL_MS = 60 * 60 * 1000;
const HARD_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export interface UploadInput {
  buffer?: Buffer;
  path?: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export function isUploadInput(file: UploadInput | undefined | null): file is UploadInput {
  return Boolean(file && Number.isSafeInteger(file.size) && file.size >= 0
    && ((Buffer.isBuffer(file.buffer) && file.buffer.length === file.size)
      || (typeof file.path === 'string' && file.path.length > 0)));
}

export async function readUploadPrefix(file: UploadInput, byteCount = 12): Promise<Buffer> {
  if (Buffer.isBuffer(file.buffer)) return file.buffer.subarray(0, byteCount);
  if (!file.path) return Buffer.alloc(0);
  const handle = await open(file.path, 'r');
  try {
    const bytes = Buffer.alloc(byteCount);
    const { bytesRead } = await handle.read(bytes, 0, byteCount, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function hashUploadInput(file: UploadInput): Promise<string> {
  const hash = createHash('sha256');
  let actualSize = 0;
  if (Buffer.isBuffer(file.buffer)) {
    actualSize = file.buffer.length;
    hash.update(file.buffer);
  } else if (file.path) {
    const info = await stat(file.path);
    if (!info.isFile() || info.size !== file.size) throw new BadRequestException('The uploaded file size is invalid');
    for await (const chunk of createReadStream(file.path)) {
      actualSize += (chunk as Buffer).length;
      hash.update(chunk as Buffer);
    }
  } else {
    throw new BadRequestException('Upload file is required');
  }
  if (actualSize !== file.size) throw new BadRequestException('The uploaded file size is invalid');
  return hash.digest('hex');
}

export function assertSameFileExtension(currentName: string, replacementName: string): void {
  const extension = (name: string) => {
    const leaf = name.replace(/\\/g, '/').split('/').pop() ?? '';
    const separator = leaf.lastIndexOf('.');
    return separator > 0 ? leaf.slice(separator + 1).toLowerCase() : '';
  };
  if (extension(currentName) !== extension(replacementName)) {
    throw new BadRequestException('The replacement file must use the same file extension');
  }
}

export function getMaxUploadBytes(): number {
  return HARD_MAX_UPLOAD_BYTES;
}

function storageFailureContext(error: unknown): string {
  if (!(error instanceof Error)) return 'name=UnknownError';
  const context = [`name=${error.name}`];
  if ('$metadata' in error) {
    const metadata = error.$metadata;
    if (typeof metadata === 'object' && metadata !== null) {
      if ('httpStatusCode' in metadata && typeof metadata.httpStatusCode === 'number') {
        context.push(`status=${metadata.httpStatusCode}`);
      }
      if ('requestId' in metadata && typeof metadata.requestId === 'string') {
        context.push(`requestId=${metadata.requestId}`);
      }
    }
  }
  return context.join(' ');
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectStorageService,
    private readonly plans: PlanCatalogueService,
  ) {}

  private safeName(input: string): string {
    const leaf = input.replace(/\\/g, '/').split('/').pop() ?? '';
    const safe = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
    return safe || 'upload';
  }

  private categorizeFile(name: string, mimeType: string): FileCategory {
    const text = `${name} ${mimeType}`.toLowerCase();
    if (/\b(invoice|receipt|budget|payroll|tax|financial|bank|expense|payment)\b/.test(text)) return FileCategory.FINANCE;
    if (/\b(contract|agreement|legal|lease|nda|policy|terms)\b/.test(text)) return FileCategory.CONTRACTS;
    if (/\b(resume|cv|employee|staff|hr|recruit|benefit|personnel)\b/.test(text)) return FileCategory.HUMAN_RESOURCES;
    if (/\b(project|proposal|report|meeting|operation|procedure|plan|minutes)\b/.test(text)) return FileCategory.OPERATIONS;
    if (/\b(personal|family|medical|passport|identity|insurance)\b/.test(text)) return FileCategory.PERSONAL;
    return FileCategory.OTHER;
  }

  async smartLibrary(userId: string) {
    const files = await this.prisma.storedFile.findMany({
      where: { userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null, eventId: null },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
        category: true,
        tags: true,
        contentHash: true,
        folder: { select: { id: true, name: true } },
      },
    });
    return files.map(({ originalName, sizeBytes, ...file }) => ({
      ...file,
      name: originalName,
      sizeBytes: sizeBytes.toString(),
    }));
  }

  async duplicateGroups(userId: string) {
    const groups = await this.prisma.storedFile.groupBy({
      by: ['contentHash'],
      where: {
        userId,
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: null,
        eventId: null,
        contentHash: { not: null },
      },
      having: { contentHash: { _count: { gt: 1 } } },
      _count: { _all: true },
      orderBy: { contentHash: 'asc' },
      take: 100,
    });
    const hashes = groups.flatMap(({ contentHash }) => contentHash ? [contentHash] : []);
    if (!hashes.length) return [];
    const files = await this.prisma.storedFile.findMany({
      where: { userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null, eventId: null, contentHash: { in: hashes } },
      orderBy: [{ contentHash: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true, contentHash: true },
    });
    const byHash = new Map<string, typeof files>();
    for (const file of files) {
      if (file.contentHash) byHash.set(file.contentHash, [...(byHash.get(file.contentHash) ?? []), file]);
    }
    return [...byHash.entries()].map(([contentHash, duplicateFiles]) => ({
      contentHash,
      files: duplicateFiles.map(({ originalName, sizeBytes, ...file }) => ({
        ...file,
        name: originalName,
        sizeBytes: sizeBytes.toString(),
      })),
    }));
  }

  async updateOrganization(userId: string, fileId: string, dto: UpdateFileOrganizationDto) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null, eventId: null },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');
    const tags = dto.tags?.map((tag) => tag.replace(/[\u0000-\u001f\u007f]/g, '').trim()).filter(Boolean);
    if (tags && new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length) {
      throw new BadRequestException('Tags must be unique');
    }
    return this.prisma.storedFile.update({
      where: { id: fileId },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(tags !== undefined && { tags }),
      },
      select: { id: true, category: true, tags: true },
    });
  }

  private async ownedFolder(userId: string, folderId?: string | null) {
    if (!folderId) return null;
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, userId, workspaceId: null }, select: { id: true } });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  private async cleanExpiredReservations(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
    const stale = await this.prisma.storedFile.findMany({
      where: { userId, workspaceId: null, status: { in: [StoredFileStatus.UPLOADING, StoredFileStatus.DELETING] }, createdAt: { lt: cutoff } },
      select: { id: true, objectKey: true, sizeBytes: true, quotaReserved: true, status: true, eventId: true },
    });
    for (const candidate of stale) {
      const claimed = await this.prisma.storedFile.updateMany({
        where: { id: candidate.id, userId, workspaceId: null, status: { in: [StoredFileStatus.UPLOADING, StoredFileStatus.DELETING] }, createdAt: { lt: cutoff } },
        data: { status: StoredFileStatus.DELETING },
      });
      if (!claimed.count) continue;
      try {
        await this.objects.delete(candidate.objectKey);
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.storedFile.findFirst({ where: { id: candidate.id, userId, workspaceId: null, status: StoredFileStatus.DELETING } });
          if (!current) return;
          const counter = candidate.quotaReserved
            ? { storageReservedBytes: { gte: current.sizeBytes } }
            : { storageUsedBytes: { gte: current.sizeBytes } };
          const data = candidate.quotaReserved
            ? { storageReservedBytes: { decrement: current.sizeBytes } }
            : { storageUsedBytes: { decrement: current.sizeBytes } };
          const adjusted = await tx.subscription.updateMany({ where: { userId, ...counter }, data });
          if (!adjusted.count) throw new Error('Storage counter is inconsistent during recovery');
          if (current.eventId) {
            const eventCounter = current.quotaReserved
              ? await tx.event.updateMany({
                where: { id: current.eventId, storageReservedBytes: { gte: current.sizeBytes } },
                data: { storageReservedBytes: { decrement: current.sizeBytes } },
              })
              : await tx.event.updateMany({
                where: { id: current.eventId, storageUsedBytes: { gte: current.sizeBytes } },
                data: { storageUsedBytes: { decrement: current.sizeBytes } },
              });
            if (!eventCounter.count) throw new Error('Event storage counter is inconsistent during recovery');
          }

          await tx.storedFile.delete({ where: { id: current.id } });
        });
      } catch {
        this.logger.warn(`Unable to clean expired storage reservation ${candidate.id}`);
        // Keep the reservation charged until the object can be safely removed.
      }
    }
  }

  async recoverExpiredReservations(userId: string): Promise<void> {
    await this.cleanExpiredReservations(userId);
  }

  async list(userId: string, folderId?: string) {
    await this.ownedFolder(userId, folderId);
    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { userId, workspaceId: null, parentFolderId: folderId ?? null },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
      }),
      this.prisma.storedFile.findMany({
        where: { userId, workspaceId: null, folderId: folderId ?? null, status: StoredFileStatus.READY, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true, isFavorite: true },
      }).then((rows) => rows.map(({ originalName, ...file }) => ({ ...file, name: originalName, sizeBytes: file.sizeBytes.toString() }))),
    ]);
    return { folderId: folderId ?? null, folders, files };
  }

  async search(userId: string, query: string) {
    const term = query.trim();
    if (!term) throw new BadRequestException('Search query cannot be empty');
    const [folders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: { userId, workspaceId: null, name: { contains: term, mode: 'insensitive' } },
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
        take: 50,
        select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
      }),
      this.prisma.storedFile.findMany({
        where: {
          userId,
          workspaceId: null,
          status: StoredFileStatus.READY,
          deletedAt: null,
          originalName: { contains: term, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true, isFavorite: true },
      }).then((rows) => rows.map(({ originalName, ...file }) => ({
        ...file,
        name: originalName,
        sizeBytes: file.sizeBytes.toString(),
      }))),
    ]);
    return { query: term, folders, files };
  }

  async listFavorites(userId: string) {
    const files = await this.prisma.storedFile.findMany({
      where: { userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null, isFavorite: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        folderId: true,
        createdAt: true,
        isFavorite: true,
        folder: { select: { name: true } },
      },
    });
    return files.map(({ originalName, sizeBytes, folder, ...file }) => ({
      ...file,
      name: originalName,
      sizeBytes: sizeBytes.toString(),
      folderName: folder?.name ?? null,
    }));
  }

  listFolderFavorites(userId: string) {
    return this.prisma.folder.findMany({
      where: { userId, workspaceId: null, isFavorite: true },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
    });
  }

  async listTrash(userId: string) {
    const files = await this.prisma.storedFile.findMany({
      where: { userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        folderId: true,
        createdAt: true,
        deletedAt: true,
        folder: { select: { name: true } },
      },
    });
    return files.map(({ originalName, sizeBytes, folder, ...file }) => ({
      ...file,
      name: originalName,
      sizeBytes: sizeBytes.toString(),
      folderName: folder?.name ?? null,
    }));
  }

  async setFavorite(userId: string, fileId: string, isFavorite: boolean) {
    const updated = await this.prisma.storedFile.updateMany({
      where: {
        id: fileId,
        userId,
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: null,
      },
      data: { isFavorite },
    });
    if (!updated.count) throw new NotFoundException('File not found');
    return { id: fileId, isFavorite };
  }

  async setFolderFavorite(userId: string, folderId: string, isFavorite: boolean) {
    const updated = await this.prisma.folder.updateMany({
      where: { id: folderId, userId, workspaceId: null },
      data: { isFavorite },
    });
    if (!updated.count) throw new NotFoundException('Folder not found');
    return { id: folderId, isFavorite };
  }

  async restoreFile(userId: string, fileId: string) {
    const restored = await this.prisma.storedFile.updateMany({
      where: {
        id: fileId,
        userId,
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    if (!restored.count) throw new NotFoundException('File not found in Recycle bin');
    return { id: fileId, restored: true };
  }

  async listFolders(userId: string, parentFolderId?: string) {
    await this.ownedFolder(userId, parentFolderId);
    return this.prisma.folder.findMany({
      where: { userId, workspaceId: null, parentFolderId: parentFolderId ?? null },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
    });
  }

  listFolderTree(userId: string) {
    return this.prisma.folder.findMany({
      where: { userId, workspaceId: null },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
    });
  }

  async getFolder(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, workspaceId: null },
      select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async createFolder(userId: string, name: string, parentFolderId?: string) {
    await this.ownedFolder(userId, parentFolderId);
    const normalizedName = name.trim();
    try {
      return await this.prisma.folder.create({
        data: { userId, workspaceId: null, name: normalizedName, parentFolderId: parentFolderId ?? null },
        select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A folder with that name already exists here');
      }
      throw error;
    }
  }

  async renameFolder(userId: string, folderId: string, name: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, userId, workspaceId: null }, select: { id: true } });
    if (!folder) throw new NotFoundException('Folder not found');
    try {
      return await this.prisma.folder.update({
        where: { id: folder.id, workspaceId: null },
        data: { name: name.trim() },
        select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A folder with that name already exists here');
      }
      throw error;
    }
  }

  async moveFolder(userId: string, folderId: string, parentFolderId?: string | null) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const folder = await tx.folder.findFirst({
          where: { id: folderId, userId, workspaceId: null },
          select: { id: true },
        });
        if (!folder) throw new NotFoundException('Folder not found');
        let ancestorId = parentFolderId ?? null;
        while (ancestorId) {
          if (ancestorId === folderId) {
            throw new BadRequestException('A folder cannot be moved into itself or one of its subfolders');
          }
          const ancestor = await tx.folder.findFirst({
            where: { id: ancestorId, userId, workspaceId: null },
            select: { id: true, parentFolderId: true },
          });
          if (!ancestor) throw new NotFoundException('Destination folder not found');
          ancestorId = ancestor.parentFolderId;
        }
        return tx.folder.update({
          where: { id: folder.id, workspaceId: null },
          data: { parentFolderId: parentFolderId ?? null },
          select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The folder changed while it was being moved. Please try again.');
      }
      throw error;
    }
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const folder = await tx.folder.findFirst({ where: { id: folderId, userId, workspaceId: null } });
        if (!folder) throw new NotFoundException('Folder not found');
        const [children, files] = await Promise.all([
          tx.folder.count({ where: { parentFolderId: folderId, workspaceId: null } }),
          tx.storedFile.count({ where: { folderId, workspaceId: null, deletedAt: null } }),
        ]);
        if (children || files) throw new ConflictException('Move or remove the folder contents before deleting this folder');
        await tx.folder.delete({ where: { id: folderId } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Move or remove the folder contents before deleting this folder');
      }
      throw error;
    }
  }

  private async reserve(
    userId: string,
    sizeBytes: bigint,
    folderId?: string,
    requiredFeature?: 'canEditDocuments' | 'canScanDocuments',
  ) {
    await this.cleanExpiredReservations(userId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (folderId) {
            const folder = await tx.folder.findFirst({ where: { id: folderId, userId, workspaceId: null }, select: { id: true } });
            if (!folder) throw new NotFoundException('Folder not found');
          }
          const subscription = await tx.subscription.findUnique({ where: { userId } });
          if (!subscription) throw new NotFoundException('Subscription not found');
          const plan = await this.plans.currentPlan(subscription, tx);
          const entitlements = await this.plans.getEntitlements(plan, tx);
          assertPlanFileSize(plan, Number(sizeBytes));
          if (requiredFeature) {
            await this.plans.requireFeature(plan, requiredFeature, tx);
          }
          if (
            subscription.storageUsedBytes + subscription.storageReservedBytes + sizeBytes
            > entitlements.storageLimitBytes
          ) {
            throw new PayloadTooLargeException(getPlanLimitMessage(plan, 'storage'));
          }
          const reserved = await tx.subscription.updateMany({
            where: {
              id: subscription.id,
              storageUsedBytes: subscription.storageUsedBytes,
              storageReservedBytes: subscription.storageReservedBytes,
            },
            data: { storageReservedBytes: { increment: sizeBytes } },
          });
          if (!reserved.count) throw new Error('STORAGE_RESERVATION_RACE');
          return tx.storedFile.create({
            data: {
              userId,
              folderId: folderId ?? null,
              objectKey: `${userId}/${randomUUID()}`,
              originalName: 'pending',
              mimeType: 'application/octet-stream',
              sizeBytes,
              status: StoredFileStatus.UPLOADING,
              uploadSource: requiredFeature === 'canScanDocuments' ? 'SCAN' : 'STANDARD',
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Error && error.message === 'STORAGE_RESERVATION_RACE') continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
    throw new ConflictException('Storage is busy. Please retry the upload.');
  }

  private async rollbackUpload(userId: string, fileId: string, sizeBytes: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.storedFile.deleteMany({ where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.UPLOADING } });
      if (removed.count) {
        await tx.subscription.update({
          where: { userId },
          data: { storageReservedBytes: { decrement: sizeBytes } },
        });
      }
    });
  }

  async upload(
    userId: string,
    file: UploadInput,
    folderId?: string,
    requiredFeature?: 'canEditDocuments' | 'canScanDocuments',
  ) {
    if (!isUploadInput(file)) throw new BadRequestException('The uploaded file size is invalid');
    if (!Number.isSafeInteger(file.size)) {
      throw new BadRequestException('The uploaded file size is invalid');
    }

    if (file.size < 1) throw new PayloadTooLargeException('Empty files are not supported');
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    assertPlanFileSize(plan, file.size);
    await this.objects.assertConfigured();
    const sizeBytes = BigInt(file.size);
    const reserved = await this.reserve(userId, sizeBytes, folderId, requiredFeature);
    const name = this.safeName(file.originalname);
    const mimeType = (file.mimetype || 'application/octet-stream').slice(0, 255);
    const category = this.categorizeFile(name, mimeType);
    try {
      const contentHash = await hashUploadInput(file);
      await this.objects.put(reserved.objectKey, file.buffer ?? file, mimeType);
      return await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.storedFile.updateMany({
          where: { id: reserved.id, userId, workspaceId: null, status: StoredFileStatus.UPLOADING, createdAt: { gte: new Date(Date.now() - RESERVATION_TTL_MS) } },
          data: { originalName: name, mimeType, contentHash, category, status: StoredFileStatus.READY, quotaReserved: false },
        });
        if (!finalized.count) throw new ConflictException('Upload reservation expired; please retry');
        const updated = await tx.subscription.updateMany({
          where: { userId, storageReservedBytes: { gte: sizeBytes } },
          data: {
            storageReservedBytes: { decrement: sizeBytes },
            storageUsedBytes: { increment: sizeBytes },
          },
        });
        if (!updated.count) throw new Error('Storage reservation was lost');
        const result = await tx.storedFile.findUniqueOrThrow({
          where: { id: reserved.id },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
        });
        return { ...result, name: result.originalName, sizeBytes: result.sizeBytes.toString() };
      });
    } catch (error) {
      let safelyRemoved = false;
      try {
        await this.objects.delete(reserved.objectKey);
        safelyRemoved = true;
      } catch (cleanupError) {
        this.logger.error(`Could not remove failed upload object for file ${reserved.id} (${storageFailureContext(cleanupError)})`);
      }
      if (safelyRemoved) {
        try {
          await this.rollbackUpload(userId, reserved.id, sizeBytes);
        } catch (cleanupError) {
          this.logger.error(`Could not release failed upload reservation ${reserved.id} (${storageFailureContext(cleanupError)})`);
        }
      }
      if (error instanceof ConflictException || error instanceof PayloadTooLargeException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      this.logger.error(`Object storage upload failed for file ${reserved.id} (${storageFailureContext(error)})`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async uploadScan(userId: string, file: UploadInput, folderId?: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    await this.plans.requireFeature(plan, 'canScanDocuments');
    return this.upload(userId, file, folderId, 'canScanDocuments');
  }

  async replaceContent(userId: string, fileId: string, replacement: UploadInput, _changeSummary?: string) {
    if (!isUploadInput(replacement)) {
      throw new BadRequestException('The uploaded file is invalid');
    }
    if (replacement.size < 1) throw new PayloadTooLargeException('Empty files are not supported');
    const current = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null },
      select: { id: true, objectKey: true, originalName: true, sizeBytes: true },
    });
    if (!current) throw new NotFoundException('File not found');
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    assertPlanFileSize(plan, replacement.size);
    await this.plans.requireFeature(plan, 'canEditDocuments');
    assertSameFileExtension(current.originalName, replacement.originalname);
    await this.objects.assertConfigured();

    const nextKey = `${userId}/${randomUUID()}`;
    const nextSize = BigInt(replacement.size);
    const delta = nextSize - current.sizeBytes;
    const contentType = (replacement.mimetype || 'application/octet-stream').slice(0, 255);
    const contentHash = await hashUploadInput(replacement);
    await this.objects.put(nextKey, replacement.buffer ?? replacement, contentType);
    try {
      await this.prisma.$transaction(async (tx) => {
        const subscription = await tx.subscription.findUnique({ where: { userId } });
        if (!subscription) throw new NotFoundException('Subscription not found');
        const plan = await this.plans.currentPlan(subscription, tx);
        const entitlements = await this.plans.getEntitlements(plan, tx);
        await this.plans.requireFeature(plan, 'canEditDocuments', tx);
        if (
          delta > 0n
          && subscription.storageUsedBytes + subscription.storageReservedBytes + delta
            > entitlements.storageLimitBytes
        ) {
          throw new PayloadTooLargeException(getPlanLimitMessage(plan, 'storage'));
        }
        if (delta !== 0n) {
          const adjusted = await tx.subscription.updateMany({
            where: {
              userId,
              storageUsedBytes: subscription.storageUsedBytes,
              storageReservedBytes: subscription.storageReservedBytes,
            },
            data: { storageUsedBytes: { increment: delta } },
          });
          if (!adjusted.count) throw new ConflictException('Storage is busy. Please retry saving.');
        }
        const updated = await tx.storedFile.updateMany({
          where: {
            id: current.id, userId, workspaceId: null, status: StoredFileStatus.READY,
            objectKey: current.objectKey, sizeBytes: current.sizeBytes, deletedAt: null,
          },
          data: {
            objectKey: nextKey,
            sizeBytes: nextSize,
            mimeType: contentType,
            contentHash,
          },
        });
        if (!updated.count) throw new ConflictException('This file changed while you were editing. Reload it and try again.');
      });
    } catch (error) {
      try {
        await this.objects.delete(nextKey);
      } catch {
        this.logger.error(`Could not remove replacement object for file ${fileId}`);
      }
      throw error;
    }
    try {
      await this.objects.delete(current.objectKey);
    } catch {
      this.logger.error(`Could not remove the previous object for file ${fileId}`);
    }
    return {
      id: current.id,
      name: current.originalName,
      mimeType: contentType,
      sizeBytes: nextSize.toString(),
    };
  }

  private async reserveEventUpload(eventId: string, fileSize: bigint) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const event = await tx.event.findUnique({ where: { id: eventId } });
          if (!event || event.status !== EventStatus.ACTIVE) throw new NotFoundException('Event not found');
          if (event.storageUsedBytes + event.storageReservedBytes + fileSize > event.storageCapBytes) {
            throw new PayloadTooLargeException('This upload exceeds the event storage cap');
          }
          const updatedEvent = await tx.event.updateMany({
            where: {
              id: event.id,
              status: EventStatus.ACTIVE,
              storageUsedBytes: event.storageUsedBytes,
              storageReservedBytes: event.storageReservedBytes,
            },
            data: { storageReservedBytes: { increment: fileSize } },
          });
          if (!updatedEvent.count) throw new Error('EVENT_RESERVATION_RACE');

          const subscription = await tx.subscription.findUnique({ where: { userId: event.ownerUserId } });
          if (!subscription) throw new NotFoundException('Subscription not found');
          const plan = await this.plans.currentPlan(subscription, tx);
          const entitlements = await this.plans.getEntitlements(plan, tx);
          assertPlanFileSize(plan, Number(fileSize));
          if (
            subscription.storageUsedBytes + subscription.storageReservedBytes + fileSize
            > entitlements.storageLimitBytes
          ) {
            throw new PayloadTooLargeException(getPlanLimitMessage(plan, 'storage'));
          }
          const reserved = await tx.subscription.updateMany({
            where: {
              id: subscription.id,
              storageUsedBytes: subscription.storageUsedBytes,
              storageReservedBytes: subscription.storageReservedBytes,
            },
            data: { storageReservedBytes: { increment: fileSize } },
          });
          if (!reserved.count) throw new Error('STORAGE_RESERVATION_RACE');
          return tx.storedFile.create({
            data: {
              userId: event.ownerUserId,
              folderId: event.folderId,
              eventId: event.id,
              objectKey: `${event.ownerUserId}/${randomUUID()}`,
              originalName: 'pending',
              mimeType: 'application/octet-stream',
              sizeBytes: fileSize,
              status: StoredFileStatus.UPLOADING,
              uploadSource: 'EVENT_MEDIA',
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Error && ['EVENT_RESERVATION_RACE', 'STORAGE_RESERVATION_RACE'].includes(error.message)) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
    throw new ConflictException('Storage is busy. Please retry the upload.');
  }

  private async rollbackEventUpload(eventId: string, userId: string, fileId: string, sizeBytes: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.storedFile.deleteMany({
        where: { id: fileId, userId, eventId, status: StoredFileStatus.UPLOADING },
      });
      if (!removed.count) return;
      const [subscription, event] = await Promise.all([
        tx.subscription.updateMany({
          where: { userId, storageReservedBytes: { gte: sizeBytes } },
          data: { storageReservedBytes: { decrement: sizeBytes } },
        }),
        tx.event.updateMany({
          where: { id: eventId, storageReservedBytes: { gte: sizeBytes } },
          data: { storageReservedBytes: { decrement: sizeBytes } },
        }),
      ]);
      if (!subscription.count || !event.count) throw new Error('Storage reservation was lost');
    });
  }

  async uploadEvent(eventId: string, file: UploadInput) {
    if (!isUploadInput(file)) {
      throw new BadRequestException('The uploaded file size is invalid');
    }
    if (file.size < 1) throw new PayloadTooLargeException('Empty files are not supported');
    await this.objects.assertConfigured();
    const sizeBytes = BigInt(file.size);
    const reserved = await this.reserveEventUpload(eventId, sizeBytes);
    const name = this.safeName(file.originalname);
    const mimeType = file.mimetype.slice(0, 255);
    try {
      await this.objects.put(reserved.objectKey, file.buffer ?? file, mimeType);
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.event.findFirst({
          where: { id: eventId, ownerUserId: reserved.userId, status: EventStatus.ACTIVE },
          select: { id: true },
        });
        if (!event) throw new ConflictException('Event is no longer accepting uploads');
        const finalized = await tx.storedFile.updateMany({
          where: { id: reserved.id, userId: reserved.userId, eventId, status: StoredFileStatus.UPLOADING },
          data: { originalName: name, mimeType, status: StoredFileStatus.READY, quotaReserved: false },
        });
        if (!finalized.count) throw new ConflictException('Upload reservation expired; please retry');
        const subscription = await tx.subscription.updateMany({
          where: { userId: reserved.userId, storageReservedBytes: { gte: sizeBytes } },
          data: {
            storageReservedBytes: { decrement: sizeBytes },
            storageUsedBytes: { increment: sizeBytes },
          },
        });
        const eventCounters = await tx.event.updateMany({
          where: { id: eventId, storageReservedBytes: { gte: sizeBytes } },
          data: {
            storageReservedBytes: { decrement: sizeBytes },
            storageUsedBytes: { increment: sizeBytes },
          },
        });
        if (!subscription.count || !eventCounters.count) throw new Error('Storage reservation was lost');
        const { originalName, sizeBytes: resultSize, ...result } = await tx.storedFile.findUniqueOrThrow({
          where: { id: reserved.id },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, eventId: true, createdAt: true },
        });
        return { ...result, name: originalName, sizeBytes: resultSize.toString() };
      });
    } catch (error) {
      let safelyRemoved = false;
      try {
        await this.objects.delete(reserved.objectKey);
        safelyRemoved = true;
      } catch (cleanupError) {
        this.logger.error(`Could not remove failed event upload object for file ${reserved.id} (${storageFailureContext(cleanupError)})`);
      }
      if (safelyRemoved) {
        try {
          await this.rollbackEventUpload(eventId, reserved.userId, reserved.id, sizeBytes);
        } catch (cleanupError) {
          this.logger.error(`Could not release failed event upload reservation ${reserved.id} (${storageFailureContext(cleanupError)})`);
        }
      }
      if (error instanceof ConflictException || error instanceof PayloadTooLargeException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      this.logger.error(`Object storage upload failed for event file ${reserved.id} (${storageFailureContext(error)})`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async download(userId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.READY, deletedAt: null },
      select: { objectKey: true, originalName: true, mimeType: true },
    });
    if (!file) throw new NotFoundException('File not found');
    try {
      return { ...(await this.objects.get(file.objectKey)), name: file.originalName, contentType: file.mimeType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Object storage read failed for file ${fileId} (${storageFailureContext(error)})`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async deleteFile(userId: string, fileId: string): Promise<void> {
    const deleted = await this.prisma.storedFile.updateMany({
      where: {
        id: fileId,
        userId,
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    if (!deleted.count) throw new NotFoundException('File not found');
  }

  async permanentlyDeleteFile(userId: string, fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        userId,
        workspaceId: null,
        OR: [
          { status: StoredFileStatus.READY, deletedAt: { not: null } },
          { status: StoredFileStatus.DELETING },
        ],
      },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.removeFileObject(userId, file);
  }

  async permanentlyDeleteEventFile(userId: string, fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        userId,
        eventId: { not: null },
        status: { in: [StoredFileStatus.READY, StoredFileStatus.DELETING] },
      },
    });
    if (!file) throw new NotFoundException('Event file not found');
    await this.removeFileObject(userId, file);
  }

  private async removeFileObject(
    userId: string,
    file: Prisma.StoredFileGetPayload<{}>,
  ): Promise<void> {
    if (file.status === StoredFileStatus.READY) {
      const claimed = await this.prisma.storedFile.updateMany({
        where: {
          id: file.id,
          userId,
          ...(file.eventId ? { eventId: file.eventId } : { workspaceId: null, deletedAt: { not: null } }),
          status: StoredFileStatus.READY,
        },
        data: { status: StoredFileStatus.DELETING },
      });
      if (!claimed.count) throw new ConflictException('File deletion is already in progress');
    }
    try {
      await this.objects.delete(file.objectKey);
    } catch (error) {
      if (file.status === StoredFileStatus.READY) {
        try {
          await this.prisma.storedFile.updateMany({
            where: {
              id: file.id,
              userId,
              ...(file.eventId ? { eventId: file.eventId } : { workspaceId: null }),
              status: StoredFileStatus.DELETING,
            },
            data: { status: StoredFileStatus.READY },
          });
        } catch {
          this.logger.error(`Could not restore file ${file.id} after object deletion failed`);
          throw new ServiceUnavailableException('File deletion could not be completed; quota remains reserved.');
        }
      }
      this.logger.error(`Object storage deletion failed for file ${file.id} (${storageFailureContext(error)})`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const deleting = await tx.storedFile.findFirst({
          where: {
            id: file.id,
            userId,
            ...(file.eventId ? { eventId: file.eventId } : { workspaceId: null }),
            status: StoredFileStatus.DELETING,
          },
        });
        if (!deleting) return;
        const counter = deleting.quotaReserved
          ? { storageReservedBytes: { gte: deleting.sizeBytes } }
          : { storageUsedBytes: { gte: deleting.sizeBytes } };
        const data = deleting.quotaReserved
          ? { storageReservedBytes: { decrement: deleting.sizeBytes } }
          : { storageUsedBytes: { decrement: deleting.sizeBytes } };
        const updated = await tx.subscription.updateMany({
          where: { userId, ...counter },
          data,
        });
        if (!updated.count) throw new Error('Storage counter is inconsistent during file deletion');
        if (deleting.eventId) {
          const eventCounter = deleting.quotaReserved
            ? await tx.event.updateMany({
              where: { id: deleting.eventId, storageReservedBytes: { gte: deleting.sizeBytes } },
              data: { storageReservedBytes: { decrement: deleting.sizeBytes } },
            })
            : await tx.event.updateMany({
              where: { id: deleting.eventId, storageUsedBytes: { gte: deleting.sizeBytes } },
              data: { storageUsedBytes: { decrement: deleting.sizeBytes } },
            });
          if (!eventCounter.count) throw new Error('Event storage counter is inconsistent during file deletion');
        }
        await tx.storedFile.delete({ where: { id: file.id } });
      });
    } catch {
      this.logger.error(`Could not finalize deletion for file ${file.id}; it remains queued for recovery`);
      throw new ServiceUnavailableException('File deletion is pending; please retry shortly.');
    }
  }
}
