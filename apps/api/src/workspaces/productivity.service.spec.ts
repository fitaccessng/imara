jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus } from '@prisma/client';
import { ProductivityService } from './productivity.service';

describe('ProductivityService', () => {
  const authorizeWorkspace = jest.fn();
  const requireWriteAccess = jest.fn();
  const storedFileFindMany = jest.fn();
  const workspaceMemberFindFirst = jest.fn();
  const noteFindMany = jest.fn();
  const prisma = {
    storedFile: { findMany: storedFileFindMany },
    workspaceMember: { findFirst: workspaceMemberFindFirst },
    workspaceNote: { findMany: noteFindMany },
  };
  const service = new ProductivityService(
    prisma as never,
    { authorizeWorkspace } as never,
    { requireWriteAccess } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authorizeWorkspace.mockResolvedValue({ status: WorkspaceMemberStatus.ACTIVE });
    requireWriteAccess.mockResolvedValue(undefined);
  });

  it('lists workspace notes only after active workspace authorization', async () => {
    noteFindMany.mockResolvedValue([]);
    await expect(service.listNotes('workspace-a', 'user-a')).resolves.toEqual([]);
    expect(authorizeWorkspace).toHaveBeenCalledWith('workspace-a', 'user-a');
    expect(noteFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace-a' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }));
  });

  it('does not disclose content to inactive members', async () => {
    authorizeWorkspace.mockResolvedValue({ status: WorkspaceMemberStatus.SUSPENDED });
    await expect(service.listNotes('workspace-a', 'user-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(noteFindMany).not.toHaveBeenCalled();
  });

  it('requires attachments to be ready and owned by the same workspace', async () => {
    storedFileFindMany.mockResolvedValue([]);
    await expect(service.createNote('workspace-a', 'user-a', {
      title: 'Meeting notes',
      body: 'Decisions',
      fileIds: ['file-from-another-workspace'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storedFileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['file-from-another-workspace'] },
        workspaceId: 'workspace-a',
        status: 'READY',
        deletedAt: null,
      }),
    }));
    expect(requireWriteAccess).toHaveBeenCalledWith('workspace-a');
  });

  it('requires an active workspace member for assignment', async () => {
    workspaceMemberFindFirst.mockResolvedValue(null);
    await expect(service.createTask('workspace-a', 'user-a', {
      title: 'Prepare report',
      assigneeUserId: 'inactive-user',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(workspaceMemberFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        userId: 'inactive-user',
        status: WorkspaceMemberStatus.ACTIVE,
      },
      select: { id: true },
    });
  });

  it('rejects empty updates instead of silently touching a task', async () => {
    await expect(service.updateTask('workspace-a', 'user-a', 'task-a', {}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates workspace task status and progress bounds in the service', async () => {
    await expect(service.createTask('workspace-a', 'user-a', {
      title: 'Bad status', status: 'UNKNOWN' as never,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateTask('workspace-a', 'user-a', 'task-a', {
      progress: 101,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(requireWriteAccess).toHaveBeenCalledWith('workspace-a');
  });
});
