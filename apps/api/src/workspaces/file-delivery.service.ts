import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { StoredFileStatus, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkspacesService } from './workspaces.service';
import { SendWorkspaceFileDto } from './file-delivery.dto';

@Injectable()
export class FileDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: ObjectStorageService,
    private readonly workspaces: WorkspacesService,
    private readonly mailer: MailerService,
  ) {}

  private async activeMember(workspaceId: string, userId: string) {
    const member = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (member.status !== WorkspaceMemberStatus.ACTIVE) throw new NotFoundException('Workspace not found');
    return member;
  }

  async send(workspaceId: string, senderId: string, fileId: string, dto: SendWorkspaceFileDto) {
    await this.activeMember(workspaceId, senderId);
    const userIds = dto.recipientUserIds ?? [];
    const emailRecipients = (dto.emailRecipients ?? []).map((email) => email.trim().toLowerCase());
    if (!userIds.length && !emailRecipients.length) {
      throw new BadRequestException('At least one workspace user or email recipient is required');
    }
    if (new Set(userIds).size !== userIds.length || new Set(emailRecipients).size !== emailRecipients.length) {
      throw new BadRequestException('Recipients can only be listed once');
    }
    if (userIds.includes(senderId)) throw new BadRequestException('You cannot send a file delivery to yourself');

    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, workspaceId, status: StoredFileStatus.READY },
      select: { id: true, objectKey: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true },
    });
    if (!file) throw new NotFoundException('File not found');
    const senderMembership = await this.activeMember(workspaceId, senderId);
    if (file.folderId) {
      await this.workspaces.authorizeFolder(workspaceId, senderId, file.folderId, 'shareFiles');
    } else if (senderMembership.role !== WorkspaceRole.OWNER && senderMembership.role !== WorkspaceRole.ADMIN) {
      throw new NotFoundException('File not found');
    }

    const recipients = userIds.length
      ? await this.prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: userIds }, status: WorkspaceMemberStatus.ACTIVE },
        select: { userId: true },
      })
      : [];
    if (recipients.length !== userIds.length) throw new NotFoundException('One or more workspace recipients were not found');

    const deliveries = await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const recipientId of userIds) {
        created.push(await tx.fileDelivery.create({
          data: { workspaceId, fileId, senderId, recipientId, message: dto.message?.trim() || null },
          select: { id: true, workspaceId: true, fileId: true, senderId: true, recipientId: true, message: true, createdAt: true },
        }));
      }
      return created;
    });

    if (emailRecipients.length) {
      let object: Awaited<ReturnType<ObjectStorageService['get']>>;
      try {
        object = await this.objects.get(file.objectKey);
      } catch {
        throw new ServiceUnavailableException('File storage is temporarily unavailable.');
      }
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId }, select: { name: true },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      try {
        await this.mailer.sendFileAttachment(
          emailRecipients, workspace.name, file.originalName, file.mimeType, object.body, dto.message,
        );
      } catch (error) {
        object.body.destroy();
        throw error;
      }
    }

    return { deliveries, emailed: emailRecipients.length > 0 };
  }

  async list(workspaceId: string, userId: string) {
    await this.activeMember(workspaceId, userId);
    const deliveries = await this.prisma.fileDelivery.findMany({
      where: { workspaceId, OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
        sender: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
    });
    return deliveries.map(({ file, ...delivery }) => ({
      ...delivery,
      file: { id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes.toString() },
    }));
  }

  async download(workspaceId: string, userId: string, deliveryId: string) {
    await this.activeMember(workspaceId, userId);
    const delivery = await this.prisma.fileDelivery.findFirst({
      where: { id: deliveryId, workspaceId, OR: [{ senderId: userId }, { recipientId: userId }] },
      select: {
        id: true, file: { select: { id: true, objectKey: true, originalName: true, mimeType: true, status: true } },
      },
    });
    if (!delivery || delivery.file.status !== StoredFileStatus.READY) throw new NotFoundException('File delivery not found');
    try {
      const object = await this.objects.get(delivery.file.objectKey);
      await this.prisma.auditLog.create({
        data: { workspaceId, actorId: userId, action: 'FILE_DELIVERY_DOWNLOADED', targetType: 'FileDelivery', targetId: delivery.id },
      });
      return { ...object, name: delivery.file.originalName, contentType: delivery.file.mimeType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }
}
