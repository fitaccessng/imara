import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FolderPermissionEffect, Prisma, StoredFileStatus, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { assertSameFileExtension, getMaxUploadBytes, UploadInput } from '../storage/storage.service';
import { WorkspacesService } from './workspaces.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { getPlanLimitMessage } from '../subscriptions/plan-entitlements';

const RESERVATION_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class WorkspaceStorageService {
  private readonly logger = new Logger(WorkspaceStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectStorageService,
    private readonly workspaces: WorkspacesService,
    private readonly plans: PlanCatalogueService,
  ) {}

  private name(input: string) {
    const leaf = input.replace(/\\/g, '/').split('/').pop() ?? '';
    return leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255) || 'upload';
  }

  private async allowedFolder(workspaceId: string, userId: string, folderId: string, permission: string) {
    return this.workspaces.authorizeFolder(workspaceId, userId, folderId, permission);
  }

  async list(workspaceId: string, userId: string, folderId?: string) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    const isAdministrator = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    if (folderId) await this.allowedFolder(workspaceId, userId, folderId, 'viewFolder');
    const [candidateFolders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where: {
          workspaceId,
          ...(folderId ? { parentFolderId: folderId } : isAdministrator ? { parentFolderId: null } : {}),
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, parentFolderId: true, createdAt: true },
      }),
      isAdministrator || (folderId && await this.canViewFiles(workspaceId, userId, folderId))
        ? this.prisma.storedFile.findMany({
          where: { workspaceId, folderId: folderId ?? null, status: StoredFileStatus.READY },
          orderBy: { createdAt: 'desc' },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
        })
        : Promise.resolve([]),
    ]);
    const visibleFolders: typeof candidateFolders = [];
    for (const folder of candidateFolders) {
      try {
        await this.allowedFolder(workspaceId, userId, folder.id, 'viewFolder');
        if (!folderId && !isAdministrator && folder.parentFolderId) {
          try {
            await this.allowedFolder(workspaceId, userId, folder.parentFolderId, 'viewFolder');
            continue;
          } catch (error) {
            if (!(error instanceof NotFoundException)) throw error;
            visibleFolders.push({ ...folder, parentFolderId: null });
            continue;
          }
        }
        visibleFolders.push(folder);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return {
      workspaceId, folderId: folderId ?? null, folders: visibleFolders,
      files: files.map(({ originalName, sizeBytes, ...file }) => ({ ...file, name: originalName, sizeBytes: sizeBytes.toString() })),
    };
  }

  private async canViewFiles(workspaceId: string, userId: string, folderId: string) {
    try {
      await this.allowedFolder(workspaceId, userId, folderId, 'viewFiles');
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  async getFolder(workspaceId: string, userId: string, folderId: string) {
    await this.allowedFolder(workspaceId, userId, folderId, 'viewFolder');
    return this.prisma.folder.findFirst({
      where: { id: folderId, workspaceId },
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
    });
  }

  async createFolder(
    workspaceId: string,
    userId: string,
    name: string,
    parentFolderId?: string,
    memberIds: string[] = [],
  ) {
    const membership = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (parentFolderId) await this.allowedFolder(workspaceId, userId, parentFolderId, 'createSubfolders');
    else if (membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.ADMIN) {
      throw new NotFoundException('Folder not found');
    }
    if (memberIds.length && membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.ADMIN) {
      throw new NotFoundException('Folder not found');
    }
    const uniqueMemberIds = [...new Set(memberIds)];
    if (uniqueMemberIds.length !== memberIds.length) throw new BadRequestException('Team members can only be assigned once');
    const normalized = name.trim();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const folder = await tx.folder.create({
          data: { workspaceId, userId, name: normalized, parentFolderId: parentFolderId ?? null },
          select: { id: true, name: true, parentFolderId: true, createdAt: true },
        });
        const assignedMembers = uniqueMemberIds.length
          ? await tx.workspaceMember.findMany({
            where: {
              id: { in: uniqueMemberIds },
              workspaceId,
              status: WorkspaceMemberStatus.ACTIVE,
              role: { in: [WorkspaceRole.MANAGER, WorkspaceRole.STAFF] },
            },
            select: { id: true, userId: true },
          })
          : [];
        if (assignedMembers.length !== uniqueMemberIds.length) {
          throw new NotFoundException('One or more selected team members are not eligible');
        }
        if (assignedMembers.length) {
          const permissionKeys = ['viewFolder', 'viewFiles', 'downloadFiles', 'uploadFiles'];
          await tx.folderPermission.createMany({
            data: assignedMembers.map((member) => ({
              workspaceId,
              folderId: folder.id,
              memberId: member.id,
              effect: FolderPermissionEffect.GRANT,
              permissionKeys,
              inherit: true,
              createdById: userId,
              updatedById: userId,
            })),
          });
          await tx.notification.createMany({
            data: assignedMembers.map((member) => ({
              workspaceId,
              userId: member.userId,
              type: 'FOLDER_ACCESS_GRANTED',
              message: `You have view, download, and upload access to the “${folder.name}” folder`,
              metadata: { folderId: folder.id } satisfies Prisma.InputJsonValue,
            })),
          });
        }
        await tx.auditLog.create({
          data: {
            workspaceId,
            actorId: userId,
            action: 'FOLDER_CREATED',
            targetType: 'Folder',
            targetId: folder.id,
            metadata: {
              parentFolderId: parentFolderId ?? null,
              assignedMemberIds: assignedMembers.map((member) => member.id),
            } satisfies Prisma.InputJsonValue,
          },
        });
        return folder;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A folder with that name already exists here');
      }
      throw error;
    }
  }

  async renameFolder(workspaceId: string, userId: string, folderId: string, name: string) {
    await this.allowedFolder(workspaceId, userId, folderId, 'renameFolders');
    const updated = await this.prisma.folder.update({
      where: { id: folderId }, data: { name: name.trim() },
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
    });
    await this.audit(workspaceId, userId, 'FOLDER_RENAMED', 'Folder', folderId);
    return updated;
  }

  async deleteFolder(workspaceId: string, userId: string, folderId: string) {
    await this.allowedFolder(workspaceId, userId, folderId, 'manageContents');
    await this.prisma.$transaction(async (tx) => {
      const [children, files] = await Promise.all([
        tx.folder.count({ where: { workspaceId, parentFolderId: folderId } }),
        tx.storedFile.count({ where: { workspaceId, folderId } }),
      ]);
      if (children || files) throw new ConflictException('Move or remove the folder contents before deleting this folder');
      const deleted = await tx.folder.deleteMany({ where: { id: folderId, workspaceId } });
      if (!deleted.count) throw new NotFoundException('Folder not found');
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'FOLDER_DELETED', targetType: 'Folder', targetId: folderId } });
    });
  }

  private async reserve(
    workspaceId: string,
    uploaderId: string,
    ownerId: string,
    folderId: string | undefined,
    size: bigint,
    requiredFeature?: 'canEditDocuments' | 'canScanDocuments',
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (folderId) {
        const folder = await tx.folder.findFirst({ where: { id: folderId, workspaceId }, select: { id: true } });
        if (!folder) throw new NotFoundException('Folder not found');
      }
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) throw new NotFoundException('Workspace not found');
      const subscription = await tx.subscription.findUnique({ where: { userId: ownerId } });
      if (!subscription) throw new NotFoundException('Subscription not found');
      const plan = await this.plans.currentPlan(subscription, tx);
      const entitlements = await this.plans.getEntitlements(plan, tx);
      if (requiredFeature) {
        await this.plans.requireFeature(plan, requiredFeature, tx);
      }
      if (
        workspace.storageUsedBytes + workspace.storageReservedBytes + size
        > entitlements.storageLimitBytes
      ) {
        throw new PayloadTooLargeException(getPlanLimitMessage(plan, 'storage'));
      }
      const changed = await tx.workspace.updateMany({
        where: {
          id: workspace.id, storageUsedBytes: workspace.storageUsedBytes,
          storageReservedBytes: workspace.storageReservedBytes,
        },
        data: { storageReservedBytes: { increment: size } },
      });
      if (!changed.count) throw new ConflictException('Storage is busy. Please retry the upload.');
      return tx.storedFile.create({
        data: {
          workspaceId, userId: uploaderId, folderId: folderId ?? null,
          objectKey: `${ownerId}/workspaces/${workspaceId}/${randomUUID()}`, originalName: 'pending',
          mimeType: 'application/octet-stream', sizeBytes: size, status: StoredFileStatus.UPLOADING,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async cleanExpiredReservations(workspaceId: string) {
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS);
    const stale = await this.prisma.storedFile.findMany({
      where: {
        workspaceId, status: { in: [StoredFileStatus.UPLOADING, StoredFileStatus.DELETING] },
        createdAt: { lt: cutoff },
      },
      select: { id: true, objectKey: true, status: true },
    });
    for (const candidate of stale) {
      const claimed = await this.prisma.storedFile.updateMany({
        where: { id: candidate.id, workspaceId, status: candidate.status, createdAt: { lt: cutoff } },
        data: { status: StoredFileStatus.DELETING },
      });
      if (!claimed.count) continue;
      try {
        await this.objects.delete(candidate.objectKey);
        await this.prisma.$transaction(async (tx) => {
          const current = await tx.storedFile.findFirst({
            where: { id: candidate.id, workspaceId, status: StoredFileStatus.DELETING },
          });
          if (!current) return;
          const field = current.quotaReserved ? 'storageReservedBytes' : 'storageUsedBytes';
          const counter = await tx.workspace.updateMany({
            where: { id: workspaceId, [field]: { gte: current.sizeBytes } },
            data: { [field]: { decrement: current.sizeBytes } },
          });
          if (!counter.count) throw new Error('Workspace storage counter is inconsistent during recovery');
          await tx.storedFile.delete({ where: { id: current.id } });
        });
      } catch {
        // Keep the reservation charged until both the object and database row are reconciled.
      }
    }
  }

  async upload(
    workspaceId: string,
    userId: string,
    file: UploadInput,
    folderId?: string,
    requiredFeature?: 'canEditDocuments' | 'canScanDocuments',
    systemGenerated = false,
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || !Number.isSafeInteger(file.size) || file.buffer.length !== file.size) {
      throw new BadRequestException('The uploaded file is invalid');
    }
    if (file.size < 1 || (!systemGenerated && file.size > getMaxUploadBytes())) {
      throw new PayloadTooLargeException('File exceeds the upload size limit');
    }
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (folderId && !systemGenerated) await this.allowedFolder(workspaceId, userId, folderId, 'uploadFiles');
    else if (!systemGenerated && member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) throw new NotFoundException('Folder not found');
    await this.objects.assertConfigured();
    const ownerId = member.workspace.ownerUserId;
    const size = BigInt(file.size);
    await this.cleanExpiredReservations(workspaceId);
    const reservation = await this.reserve(
      workspaceId,
      userId,
      ownerId,
      folderId,
      size,
      requiredFeature,
    );
    const originalName = this.name(file.originalname);
    const mimeType = (file.mimetype || 'application/octet-stream').slice(0, 255);
    try {
      await this.objects.put(reservation.objectKey, file.buffer, mimeType);
      return await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.storedFile.updateMany({
          where: { id: reservation.id, workspaceId, status: StoredFileStatus.UPLOADING, createdAt: { gte: new Date(Date.now() - RESERVATION_TTL_MS) } },
          data: { originalName, mimeType, status: StoredFileStatus.READY, quotaReserved: false },
        });
        if (!finalized.count) throw new ConflictException('Upload reservation expired; please retry');
        const counter = await tx.workspace.updateMany({
          where: { id: workspaceId, storageReservedBytes: { gte: size } },
          data: { storageReservedBytes: { decrement: size }, storageUsedBytes: { increment: size } },
        });
        if (!counter.count) throw new Error('Workspace storage reservation was lost');
        const stored = await tx.storedFile.findUniqueOrThrow({
          where: { id: reservation.id },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: { workspaceId, actorId: userId, action: 'FILE_UPLOADED', targetType: 'StoredFile', targetId: reservation.id,
            metadata: { folderId: folderId ?? null } satisfies Prisma.InputJsonValue },
        });
        return { ...stored, name: stored.originalName, sizeBytes: stored.sizeBytes.toString() };
      });
    } catch (error) {
      try {
        await this.objects.delete(reservation.objectKey);
        await this.prisma.$transaction(async (tx) => {
          const removed = await tx.storedFile.deleteMany({ where: { id: reservation.id, workspaceId } });
          if (removed.count) {
            await tx.workspace.updateMany({
              where: { id: workspaceId, storageReservedBytes: { gte: size } },
              data: { storageReservedBytes: { decrement: size } },
            });
          }
        });
      } catch {
        // Reservation remains billed until cleanup can safely recover the object.
      }
      if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof PayloadTooLargeException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async uploadGenerated(workspaceId: string, userId: string, name: string, contents: Buffer, folderId?: string | null) {
    return this.upload(
      workspaceId,
      userId,
      { buffer: contents, size: contents.length, originalname: name, mimetype: 'application/pdf' } as UploadInput,
      folderId ?? undefined,
      undefined,
      true,
    );
  }

  async uploadScan(workspaceId: string, userId: string, file: UploadInput, folderId?: string) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: member.workspace.ownerUserId },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    await this.plans.requireFeature(plan, 'canScanDocuments');
    return this.upload(workspaceId, userId, file, folderId, 'canScanDocuments');
  }

  async replaceContent(workspaceId: string, userId: string, fileId: string, replacement: UploadInput) {
    if (!replacement || !Buffer.isBuffer(replacement.buffer)
      || !Number.isSafeInteger(replacement.size) || replacement.buffer.length !== replacement.size) {
      throw new BadRequestException('The uploaded file is invalid');
    }
    if (replacement.size < 1 || replacement.size > getMaxUploadBytes()) {
      throw new PayloadTooLargeException('File exceeds the upload size limit');
    }
    const current = await this.authorizedFile(workspaceId, userId, fileId, 'editFiles');
    assertSameFileExtension(current.originalName, replacement.originalname);
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: member.workspace.ownerUserId },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    await this.plans.requireFeature(plan, 'canEditDocuments');
    await this.objects.assertConfigured();

    const nextKey = `${member.workspace.ownerUserId}/workspaces/${workspaceId}/${randomUUID()}`;
    const nextSize = BigInt(replacement.size);
    const delta = nextSize - current.sizeBytes;
    const contentType = (replacement.mimetype || 'application/octet-stream').slice(0, 255);
    await this.objects.put(nextKey, replacement.buffer, contentType);
    try {
      await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new NotFoundException('Workspace not found');
        const subscription = await tx.subscription.findUnique({
          where: { userId: member.workspace.ownerUserId },
        });
        if (!subscription) throw new NotFoundException('Subscription not found');
        const plan = await this.plans.currentPlan(subscription, tx);
        const entitlements = await this.plans.getEntitlements(plan, tx);
        await this.plans.requireFeature(plan, 'canEditDocuments', tx);
        if (
          delta > 0n
          && workspace.storageUsedBytes + workspace.storageReservedBytes + delta
            > entitlements.storageLimitBytes
        ) {
          throw new PayloadTooLargeException(getPlanLimitMessage(plan, 'storage'));
        }
        if (delta !== 0n) {
          const adjusted = await tx.workspace.updateMany({
            where: {
              id: workspaceId,
              storageUsedBytes: workspace.storageUsedBytes,
              storageReservedBytes: workspace.storageReservedBytes,
            },
            data: { storageUsedBytes: { increment: delta } },
          });
          if (!adjusted.count) throw new ConflictException('Workspace storage is busy. Please retry saving.');
        }
        const updated = await tx.storedFile.updateMany({
          where: {
            id: current.id, workspaceId, status: StoredFileStatus.READY,
            objectKey: current.objectKey, sizeBytes: current.sizeBytes,
          },
          data: { objectKey: nextKey, sizeBytes: nextSize, mimeType: contentType },
        });
        if (!updated.count) throw new ConflictException('This file changed while you were editing. Reload it and try again.');
        await tx.auditLog.create({
          data: { workspaceId, actorId: userId, action: 'FILE_EDITED', targetType: 'StoredFile', targetId: fileId },
        });
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

  private async authorizedFile(workspaceId: string, userId: string, fileId: string, permission: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, workspaceId, status: StoredFileStatus.READY },
      select: { id: true, userId: true, folderId: true, objectKey: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!file) throw new NotFoundException('File not found');
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (file.folderId) await this.allowedFolder(workspaceId, userId, file.folderId, permission);
    else if (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) throw new NotFoundException('File not found');
    return file;
  }

  async download(workspaceId: string, userId: string, fileId: string) {
    const file = await this.authorizedFile(workspaceId, userId, fileId, 'downloadFiles');
    try {
      const object = await this.objects.get(file.objectKey);
      await this.audit(workspaceId, userId, 'FILE_DOWNLOADED', 'StoredFile', fileId);
      return { ...object, name: file.originalName, contentType: file.mimeType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }

  async renameFile(workspaceId: string, userId: string, fileId: string, name: string) {
    await this.authorizedFile(workspaceId, userId, fileId, 'renameFiles');
    const updated = await this.prisma.storedFile.updateMany({
      where: { id: fileId, workspaceId, status: StoredFileStatus.READY },
      data: { originalName: this.name(name) },
    });
    if (!updated.count) throw new NotFoundException('File not found');
    await this.audit(workspaceId, userId, 'FILE_RENAMED', 'StoredFile', fileId);
    return this.prisma.storedFile.findFirst({
      where: { id: fileId, workspaceId },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
    });
  }

  async moveFile(workspaceId: string, userId: string, fileId: string, destinationFolderId?: string) {
    const file = await this.authorizedFile(workspaceId, userId, fileId, 'moveFiles');
    if (destinationFolderId) await this.allowedFolder(workspaceId, userId, destinationFolderId, 'uploadFiles');
    else {
      const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
      if (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) throw new NotFoundException('Folder not found');
    }
    const updated = await this.prisma.storedFile.updateMany({
      where: { id: fileId, workspaceId, status: StoredFileStatus.READY },
      data: { folderId: destinationFolderId ?? null },
    });
    if (!updated.count) throw new NotFoundException('File not found');
    await this.audit(workspaceId, userId, 'FILE_MOVED', 'StoredFile', fileId, { from: file.folderId, to: destinationFolderId ?? null });
    return { id: fileId, folderId: destinationFolderId ?? null };
  }

  async deleteFile(workspaceId: string, userId: string, fileId: string) {
    const file = await this.authorizedFile(workspaceId, userId, fileId, 'deleteFiles');
    const claimed = await this.prisma.storedFile.updateMany({
      where: { id: file.id, workspaceId, status: StoredFileStatus.READY },
      data: { status: StoredFileStatus.DELETING },
    });
    if (!claimed.count) throw new ConflictException('File deletion is already in progress');
    try {
      await this.objects.delete(file.objectKey);
    } catch {
      await this.prisma.storedFile.updateMany({
        where: { id: file.id, workspaceId, status: StoredFileStatus.DELETING },
        data: { status: StoredFileStatus.READY },
      });
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const deleting = await tx.storedFile.findFirst({ where: { id: file.id, workspaceId, status: StoredFileStatus.DELETING } });
        if (!deleting) return;
        const counterField = deleting.quotaReserved ? 'storageReservedBytes' : 'storageUsedBytes';
        const decremented = await tx.workspace.updateMany({
          where: { id: workspaceId, [counterField]: { gte: deleting.sizeBytes } },
          data: { [counterField]: { decrement: deleting.sizeBytes } },
        });
        if (!decremented.count) throw new Error('Workspace quota counter is inconsistent');
        await tx.storedFile.delete({ where: { id: file.id } });
        await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: 'FILE_DELETED', targetType: 'StoredFile', targetId: fileId } });
      });
    } catch {
      throw new ServiceUnavailableException('File deletion is pending; please retry shortly.');
    }
  }

  private async audit(workspaceId: string, actorId: string, action: string, targetType: string, targetId: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({
      data: { workspaceId, actorId, action, targetType, targetId, ...(metadata ? { metadata } : {}) },
    });
  }
}
