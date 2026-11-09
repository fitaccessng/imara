import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StoredFileStatus, WorkspaceChatConversationType, WorkspaceMemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceChatMessageDto } from './workspace-chat.dto';

const MESSAGE_LIMIT = 50;

@Injectable()
export class WorkspaceChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private async workspaceRoom(workspaceId: string) {
    return this.prisma.workspaceChatConversation.upsert({
      where: { workspaceId_channelKey: { workspaceId, channelKey: 'workspace' } },
      create: { workspaceId, type: WorkspaceChatConversationType.WORKSPACE, channelKey: 'workspace' },
      update: {},
    });
  }

  private async currentMember(workspaceId: string, userId: string) {
    return this.workspaces.authorizeWorkspace(workspaceId, userId);
  }

  private async accessibleConversation(workspaceId: string, conversationId: string, userId: string) {
    const member = await this.currentMember(workspaceId, userId);
    const conversation = await this.prisma.workspaceChatConversation.findFirst({
      where: { id: conversationId, workspaceId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type === WorkspaceChatConversationType.DIRECT) {
      if (conversation.memberAId !== member.id && conversation.memberBId !== member.id) {
        throw new NotFoundException('Conversation not found');
      }
      const activeParticipants = await this.prisma.workspaceMember.count({
        where: {
          workspaceId,
          id: { in: [conversation.memberAId!, conversation.memberBId!] },
          status: WorkspaceMemberStatus.ACTIVE,
        },
      });
      if (activeParticipants !== 2) throw new NotFoundException('Conversation not found');
    }
    return { member, conversation };
  }

  async listMembers(workspaceId: string, userId: string) {
    const member = await this.currentMember(workspaceId, userId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: WorkspaceMemberStatus.ACTIVE, id: { not: member.id } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true, role: true, displayName: true,
        user: { select: { name: true } },
      },
    });
    return members.map(({ user, ...item }) => ({
      id: item.id,
      displayName: item.displayName ?? user.name,
      role: item.role,
    }));
  }

  async listFiles(workspaceId: string, userId: string) {
    const member = await this.currentMember(workspaceId, userId);
    const folders = await this.workspaces.accessibleFolders(workspaceId, userId);
    const visibleFolderIds = folders
      .filter((folder) => folder.permissions.includes('viewFiles'))
      .map((folder) => folder.id);
    const canViewWorkspaceFiles = member.role === 'OWNER' || member.role === 'ADMIN';
    const accessibleLocations = [
      ...(canViewWorkspaceFiles ? [{ folderId: null }] : []),
      ...(visibleFolderIds.length ? [{ folderId: { in: visibleFolderIds } }] : []),
    ];
    if (!accessibleLocations.length) return [];

    const files = await this.prisma.storedFile.findMany({
      where: {
        workspaceId,
        status: StoredFileStatus.READY,
        deletedAt: null,
        OR: accessibleLocations,
      },
      orderBy: [{ originalName: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, folderId: true, createdAt: true },
    });
    return files.map(({ originalName, sizeBytes, ...file }) => ({
      ...file,
      name: originalName,
      sizeBytes: sizeBytes.toString(),
    }));
  }

  async listConversations(workspaceId: string, userId: string) {
    const member = await this.currentMember(workspaceId, userId);
    await this.workspaceRoom(workspaceId);
    const conversations = await this.prisma.workspaceChatConversation.findMany({
      where: {
        workspaceId,
        OR: [
          { type: WorkspaceChatConversationType.WORKSPACE },
          { type: WorkspaceChatConversationType.DIRECT, memberAId: member.id },
          { type: WorkspaceChatConversationType.DIRECT, memberBId: member.id },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: {
        messages: {
          take: 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, senderMemberId: true, senderName: true, content: true, fileId: true, createdAt: true },
        },
      },
    });
    const directIds = conversations.flatMap((item) =>
      item.type === WorkspaceChatConversationType.DIRECT
        ? [item.memberAId!, item.memberBId!]
        : []);
    const activeIds = new Set((await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: WorkspaceMemberStatus.ACTIVE, id: { in: directIds } },
      select: { id: true },
    })).map(({ id }) => id));

    return conversations
      .filter((item) =>
        item.type === WorkspaceChatConversationType.WORKSPACE
        || (activeIds.has(item.memberAId!) && activeIds.has(item.memberBId!)))
      .map(({ messages, channelKey: _channelKey, ...item }) => ({ ...item, lastMessage: messages[0] ?? null }));
  }

  async getOrCreateDirectConversation(workspaceId: string, userId: string, targetMemberId: string) {
    const member = await this.currentMember(workspaceId, userId);
    if (member.id === targetMemberId) throw new ForbiddenException('You cannot start a conversation with yourself');
    const target = await this.prisma.workspaceMember.findFirst({
      where: { id: targetMemberId, workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Workspace member not found');
    const [memberAId, memberBId] = [member.id, target.id].sort();
    const channelKey = `direct:${memberAId}:${memberBId}`;
    const conversation = await this.prisma.workspaceChatConversation.upsert({
      where: { workspaceId_channelKey: { workspaceId, channelKey } },
      create: {
        workspaceId, channelKey, type: WorkspaceChatConversationType.DIRECT, memberAId, memberBId,
      },
      update: {},
    });
    const { channelKey: _channelKey, ...response } = conversation;
    return response;
  }

  async listMessages(
    workspaceId: string,
    conversationId: string,
    userId: string,
    afterId?: string,
    beforeId?: string,
    requestedLimit?: number,
  ) {
    const { member } = await this.accessibleConversation(workspaceId, conversationId, userId);
    if (afterId && beforeId) throw new BadRequestException('Use either afterId or beforeId, not both');
    const limit = requestedLimit ?? MESSAGE_LIMIT;
    let cursor: { id: string; createdAt: Date } | null = null;
    const cursorId = afterId ?? beforeId;
    if (cursorId) {
      cursor = await this.prisma.workspaceChatMessage.findFirst({
        where: { id: cursorId, workspaceId, conversationId },
        select: { id: true, createdAt: true },
      });
      if (!cursor) throw new NotFoundException('Message cursor not found');
    }

    const where: Prisma.WorkspaceChatMessageWhereInput = {
      workspaceId,
      conversationId,
      ...(cursor && afterId ? {
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      } : cursor && beforeId ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      } : {}),
    };
    const select = {
      id: true, workspaceId: true, conversationId: true, senderMemberId: true,
      senderName: true, content: true, fileId: true, createdAt: true,
    } as const;
    const olderPage = !afterId;
    const fetched = await this.prisma.workspaceChatMessage.findMany({
      where,
      take: limit + 1,
      orderBy: olderPage ? [{ createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'asc' }, { id: 'asc' }],
      select,
    });
    const hasMore = fetched.length > limit;
    const results = fetched.slice(0, limit);
    if (olderPage) results.reverse();
    return {
      messages: results.map((message) => ({ ...message, isMine: message.senderMemberId === member.id })),
      nextAfterId: results.at(-1)?.id ?? null,
      nextBeforeId: olderPage && hasMore ? results[0]?.id ?? null : null,
    };
  }

  private async authorizeFileReference(workspaceId: string, userId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, workspaceId, status: StoredFileStatus.READY, deletedAt: null },
      select: { id: true, folderId: true },
    });
    if (!file) throw new NotFoundException('File not found');
    const member = await this.currentMember(workspaceId, userId);
    if (file.folderId) {
      await this.workspaces.authorizeFolder(workspaceId, userId, file.folderId, 'viewFiles');
    } else if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new NotFoundException('File not found');
    }
  }

  async sendMessage(
    workspaceId: string,
    conversationId: string,
    userId: string,
    dto: CreateWorkspaceChatMessageDto,
  ) {
    const { member, conversation } = await this.accessibleConversation(workspaceId, conversationId, userId);
    if (dto.fileId) await this.authorizeFileReference(workspaceId, userId, dto.fileId);
    const sender = await this.prisma.workspaceMember.findFirst({
      where: { id: member.id, workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true, displayName: true, user: { select: { name: true } } },
    });
    if (!sender) throw new NotFoundException('Workspace not found');
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Message cannot be empty');
    const message = await this.prisma.$transaction(async (tx) => {
      const message = await tx.workspaceChatMessage.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          senderMemberId: sender.id,
          senderName: sender.displayName ?? sender.user.name,
          content,
          fileId: dto.fileId ?? null,
        },
        select: {
          id: true, workspaceId: true, conversationId: true, senderMemberId: true,
          senderName: true, content: true, fileId: true, createdAt: true,
        },
      });
      await tx.workspaceChatConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      return message;
    });
    return { ...message, isMine: true };
  }
}
