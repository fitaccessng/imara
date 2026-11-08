import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventStatus, Prisma, StoredFileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { getPlanLimitMessage } from '../subscriptions/plan-entitlements';

const RESERVATION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const HARD_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
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
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > HARD_MAX_UPLOAD_BYTES) {
    throw new Error(`MAX_UPLOAD_BYTES must be an integer between 1 and ${HARD_MAX_UPLOAD_BYTES}`);
  }
  return maxBytes;
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
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
      }),
      this.prisma.storedFile.findMany({
        where: { userId, workspaceId: null, folderId: folderId ?? null, status: StoredFileStatus.READY },
        orderBy: { createdAt: 'desc' },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
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
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
      }),
      this.prisma.storedFile.findMany({
        where: {
          userId,
          workspaceId: null,
          status: StoredFileStatus.READY,
          originalName: { contains: term, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
      }).then((rows) => rows.map(({ originalName, ...file }) => ({
        ...file,
        name: originalName,
        sizeBytes: file.sizeBytes.toString(),
      }))),
    ]);
    return { query: term, folders, files };
  }

  async listFolders(userId: string, parentFolderId?: string) {
    await this.ownedFolder(userId, parentFolderId);
    return this.prisma.folder.findMany({
      where: { userId, workspaceId: null, parentFolderId: parentFolderId ?? null },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
    });
  }

  listFolderTree(userId: string) {
    return this.prisma.folder.findMany({
      where: { userId, workspaceId: null },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
    });
  }

  async getFolder(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, userId, workspaceId: null },
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
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
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
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
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
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
          select: { id: true, name: true, parentFolderId: true, createdAt: true },
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
          tx.storedFile.count({ where: { folderId, workspaceId: null } }),
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
    if (!file || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('Upload file is required');
    if (!Number.isSafeInteger(file.size) || file.buffer.length !== file.size) {
      throw new BadRequestException('The uploaded file size is invalid');
    }

    if (file.size < 1) throw new PayloadTooLargeException('Empty files are not supported');
    if (file.size > getMaxUploadBytes()) throw new PayloadTooLargeException('File exceeds the upload size limit');
    this.objects.assertConfigured();
    const sizeBytes = BigInt(file.size);
    const reserved = await this.reserve(userId, sizeBytes, folderId, requiredFeature);
    const name = this.safeName(file.originalname);
    const mimeType = (file.mimetype || 'application/octet-stream').slice(0, 255);
    try {
      await this.objects.put(reserved.objectKey, file.buffer, mimeType);
      return await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.storedFile.updateMany({
          where: { id: reserved.id, userId, workspaceId: null, status: StoredFileStatus.UPLOADING, createdAt: { gte: new Date(Date.now() - RESERVATION_TTL_MS) } },
          data: { originalName: name, mimeType, status: StoredFileStatus.READY, quotaReserved: false },
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
      } catch {
        this.logger.error(`Could not remove failed upload object for file ${reserved.id}`);
      }
      if (safelyRemoved) {
        try {
          await this.rollbackUpload(userId, reserved.id, sizeBytes);
        } catch {
          this.logger.error(`Could not release failed upload reservation ${reserved.id}`);
        }
      }
      if (error instanceof ConflictException || error instanceof PayloadTooLargeException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      this.logger.error(`Object storage upload failed for file ${reserved.id}`);
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

  async replaceContent(userId: string, fileId: string, replacement: UploadInput) {
    if (!replacement || !Buffer.isBuffer(replacement.buffer)
      || !Number.isSafeInteger(replacement.size) || replacement.buffer.length !== replacement.size) {
      throw new BadRequestException('The uploaded file is invalid');
    }
    if (replacement.size < 1 || replacement.size > getMaxUploadBytes()) {
      throw new PayloadTooLargeException('File exceeds the upload size limit');
    }
    const current = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.READY },
      select: { id: true, objectKey: true, originalName: true, sizeBytes: true },
    });
    if (!current) throw new NotFoundException('File not found');
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    await this.plans.requireFeature(plan, 'canEditDocuments');
    assertSameFileExtension(current.originalName, replacement.originalname);
    this.objects.assertConfigured();

    const nextKey = `${userId}/${randomUUID()}`;
    const nextSize = BigInt(replacement.size);
    const delta = nextSize - current.sizeBytes;
    const contentType = (replacement.mimetype || 'application/octet-stream').slice(0, 255);
    await this.objects.put(nextKey, replacement.buffer, contentType);
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
            objectKey: current.objectKey, sizeBytes: current.sizeBytes,
          },
          data: { objectKey: nextKey, sizeBytes: nextSize, mimeType: contentType },
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
    if (!file || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('Upload file is required');
    if (!Number.isSafeInteger(file.size) || file.buffer.length !== file.size) {
      throw new BadRequestException('The uploaded file size is invalid');
    }
    if (file.size < 1) throw new PayloadTooLargeException('Empty files are not supported');
    if (file.size > getMaxUploadBytes()) throw new PayloadTooLargeException('File exceeds the upload size limit');
    this.objects.assertConfigured();
    const sizeBytes = BigInt(file.size);
    const reserved = await this.reserveEventUpload(eventId, sizeBytes);
    const name = this.safeName(file.originalname);
    const mimeType = file.mimetype.slice(0, 255);
    try {
      await this.objects.put(reserved.objectKey, file.buffer, mimeType);
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
      } catch {
        this.logger.error(`Could not remove failed event upload object for file ${reserved.id}`);
      }
      if (safelyRemoved) {
        try {
          await this.rollbackEventUpload(eventId, reserved.userId, reserved.id, sizeBytes);
        } catch {
          this.logger.error(`Could not release failed event upload reservation ${reserved.id}`);
        }
      }
      if (error instanceof ConflictException || error instanceof PayloadTooLargeException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
      this.logger.error(`Object storage upload failed for event file ${reserved.id}`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async download(userId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: StoredFileStatus.READY },
      select: { objectKey: true, originalName: true, mimeType: true },
    });
    if (!file) throw new NotFoundException('File not found');
    try {
      return { ...(await this.objects.get(file.objectKey)), name: file.originalName, contentType: file.mimeType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async deleteFile(userId: string, fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, userId, workspaceId: null, status: { in: [StoredFileStatus.READY, StoredFileStatus.DELETING] } },
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.status === StoredFileStatus.READY) {
      const claimed = await this.prisma.storedFile.updateMany({
        where: { id: file.id, userId, workspaceId: null, status: StoredFileStatus.READY },
        data: { status: StoredFileStatus.DELETING },
      });
      if (!claimed.count) throw new ConflictException('File deletion is already in progress');
    }
    try {
      await this.objects.delete(file.objectKey);
    } catch {
      if (file.status === StoredFileStatus.READY) {
        try {
          await this.prisma.storedFile.updateMany({
            where: { id: file.id, userId, workspaceId: null, status: StoredFileStatus.DELETING },
            data: { status: StoredFileStatus.READY },
          });
        } catch {
          this.logger.error(`Could not restore file ${file.id} after object deletion failed`);
          throw new ServiceUnavailableException('File deletion could not be completed; quota remains reserved.');
        }
      }
      this.logger.error(`Object storage deletion failed for file ${file.id}`);
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const deleting = await tx.storedFile.findFirst({ where: { id: file.id, userId, workspaceId: null, status: StoredFileStatus.DELETING } });
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
