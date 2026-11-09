jest.mock('@nestjs/common', () => {
  class MockBadRequestException extends Error {}
  class MockForbiddenException extends Error {}
  class MockNotFoundException extends Error {}
  return {
    BadRequestException: MockBadRequestException,
    ForbiddenException: MockForbiddenException,
    NotFoundException: MockNotFoundException,
    Injectable: () => (target: unknown) => target,
  };
});

jest.mock('./workspaces.service', () => ({ WorkspacesService: class {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceChatConversationType, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceChatService } from './workspace-chat.service';

describe('WorkspaceChatService', () => {
  const member = {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000010',
    userId: '00000000-0000-4000-8000-000000000101',
    role: WorkspaceRole.STAFF,
  };
  const workspaceId = member.workspaceId;

  function makeService(prisma: Record<string, unknown>, workspaces?: Record<string, jest.Mock>) {
    const workspaceService = {
      authorizeWorkspace: jest.fn().mockResolvedValue(member),
      authorizeFolder: jest.fn().mockResolvedValue(undefined),
      accessibleFolders: jest.fn().mockResolvedValue([]),
      ...workspaces,
    };
    return {
      service: new WorkspaceChatService(prisma as unknown as PrismaService, workspaceService as unknown as WorkspacesService),
      workspaceService,
    };
  }

  it('does not expose a direct conversation to another workspace member', async () => {
    const prisma = {
      workspaceChatConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-id', workspaceId, type: WorkspaceChatConversationType.DIRECT,
          memberAId: 'member-a', memberBId: 'member-b',
        }),
      },
      workspaceMember: { count: jest.fn() },
    };
    const { service } = makeService(prisma as never);

    await expect(service.listMessages(workspaceId, 'conversation-id', member.userId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceMember.count).not.toHaveBeenCalled();
  });

  it('rejects file references that are not ready files in this workspace', async () => {
    const prisma = {
      workspaceChatConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-id', workspaceId, type: WorkspaceChatConversationType.WORKSPACE,
          memberAId: null, memberBId: null,
        }),
      },
      storedFile: { findFirst: jest.fn().mockResolvedValue(null) },
      workspaceMember: { findFirst: jest.fn() },
      workspaceChatMessage: { create: jest.fn() },
    };
    const { service, workspaceService } = makeService(prisma as never);

    await expect(service.sendMessage(workspaceId, 'conversation-id', member.userId, {
      content: 'Please review this', fileId: '00000000-0000-4000-8000-000000000020',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.storedFile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId, status: 'READY', deletedAt: null }),
    }));
    expect(workspaceService.authorizeFolder).not.toHaveBeenCalled();
    expect(prisma.workspaceChatMessage.create).not.toHaveBeenCalled();
  });

  it('requires viewFiles permission and stores an authorized attachment reference', async () => {
    const message = {
      id: 'message-id', workspaceId, conversationId: 'conversation-id',
      senderMemberId: member.id, senderName: 'Staff', content: 'Please review this',
      fileId: '00000000-0000-4000-8000-000000000020', createdAt: new Date(),
    };
    const prisma = {
      workspaceChatConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-id', workspaceId, type: WorkspaceChatConversationType.WORKSPACE,
          memberAId: null, memberBId: null,
        }),
      },
      storedFile: { findFirst: jest.fn().mockResolvedValue({ id: message.fileId, folderId: 'folder-id' }) },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: member.id, userId: member.userId, displayName: 'Staff', user: { name: 'Staff User' },
        }),
      },
      $transaction: jest.fn(async (callback: (tx: Record<string, unknown>) => unknown) => callback({
        workspaceChatMessage: { create: jest.fn().mockResolvedValue(message) },
        workspaceChatConversation: { update: jest.fn().mockResolvedValue(undefined) },
      })),
    };
    const { service, workspaceService } = makeService(prisma as never);

    await expect(service.sendMessage(workspaceId, 'conversation-id', member.userId, {
      content: '  Please review this  ', fileId: message.fileId,
    })).resolves.toEqual({ ...message, isMine: true });
    expect(workspaceService.authorizeFolder).toHaveBeenCalledWith(workspaceId, member.userId, 'folder-id', 'viewFiles');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('only lists ready files in folders where the member can view files', async () => {
    const files = [{
      id: 'file-id',
      originalName: 'brief.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
      folderId: 'visible-folder',
      createdAt: new Date(),
    }];
    const prisma = { storedFile: { findMany: jest.fn().mockResolvedValue(files) } };
    const { service, workspaceService } = makeService(prisma as never, {
      accessibleFolders: jest.fn().mockResolvedValue([
        { id: 'visible-folder', permissions: ['viewFolder', 'viewFiles'] },
        { id: 'hidden-folder', permissions: ['viewFolder'] },
      ]),
    });

    await expect(service.listFiles(workspaceId, member.userId)).resolves.toEqual([{
      id: files[0].id,
      mimeType: files[0].mimeType,
      folderId: files[0].folderId,
      createdAt: files[0].createdAt,
      sizeBytes: '120',
      name: 'brief.pdf',
    }]);
    expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId,
        status: 'READY',
        deletedAt: null,
        OR: [{ folderId: { in: ['visible-folder'] } }],
      }),
    }));
    expect(workspaceService.accessibleFolders).toHaveBeenCalledWith(workspaceId, member.userId);
  });

  it('marks fetched messages authored by the requesting member', async () => {
    const messages = [{
      id: 'message-id', workspaceId, conversationId: 'conversation-id',
      senderMemberId: member.id, senderName: 'Staff', content: 'Hello',
      fileId: null, createdAt: new Date(),
    }];
    const prisma = {
      workspaceChatConversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conversation-id', workspaceId, type: WorkspaceChatConversationType.WORKSPACE,
          memberAId: null, memberBId: null,
        }),
      },
      workspaceChatMessage: { findMany: jest.fn().mockResolvedValue(messages) },
    };
    const { service } = makeService(prisma as never);

    await expect(service.listMessages(workspaceId, 'conversation-id', member.userId)).resolves.toMatchObject({
      messages: [{ ...messages[0], isMine: true }],
      nextAfterId: 'message-id',
      nextBeforeId: null,
    });
  });

  it('does not create direct chats with suspended, removed, or out-of-workspace members', async () => {
    const prisma = {
      workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      workspaceChatConversation: { upsert: jest.fn() },
    };
    const { service } = makeService(prisma as never);

    await expect(service.getOrCreateDirectConversation(
      workspaceId,
      member.userId,
      '00000000-0000-4000-8000-000000000099',
    )).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceChatConversation.upsert).not.toHaveBeenCalled();
  });

  it('prevents a member from opening their own direct chat', async () => {
    const prisma = { workspaceChatConversation: { upsert: jest.fn() } };
    const { service } = makeService(prisma as never);

    await expect(service.getOrCreateDirectConversation(workspaceId, member.userId, member.id))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceChatConversation.upsert).not.toHaveBeenCalled();
  });
});
