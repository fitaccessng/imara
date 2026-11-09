import 'reflect-metadata';

jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ForbiddenException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException } from '@nestjs/common';
import { ReminderRecurrence, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { WorkspacesService } from '../workspaces/workspaces.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  const prisma = {
    reminder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workspaceMember: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  const workspaces = {
    authorizeWorkspace: jest.fn(),
  } as unknown as WorkspacesService;
  const service = new RemindersService(prisma, workspaces);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(workspaces.authorizeWorkspace).mockResolvedValue({
      id: 'member-id',
      role: WorkspaceRole.STAFF,
    } as Awaited<ReturnType<WorkspacesService['authorizeWorkspace']>>);
    jest.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({
      id: 'member-id',
      workspaceId: 'workspace-id',
      userId: 'user-id',
      displayName: null,
      role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.ACTIVE,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('rejects reminders with an empty title', async () => {
    await expect(service.create('workspace-id', 'user-id', {
      title: '  ',
      dueAt: new Date().toISOString(),
      recurrence: ReminderRecurrence.ONCE,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('only assigns reminders to active workspace members', async () => {
    jest.mocked(prisma.workspaceMember.findFirst).mockResolvedValue(null);

    await expect(service.create('workspace-id', 'user-id', {
      title: 'Review agreement',
      dueAt: new Date().toISOString(),
      recurrence: ReminderRecurrence.ONCE,
      assignedToUserId: 'external-user',
    })).rejects.toThrow('Assignee must be an active workspace member');
    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('acknowledges a recurring occurrence without cancelling its schedule', async () => {
    const nextDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const reminder = {
      id: 'reminder-id',
      workspaceId: 'workspace-id',
      createdById: 'user-id',
      assignedToId: 'user-id',
      title: 'Review agreement',
      description: null,
      recurrence: ReminderRecurrence.DAILY,
      emailEnabled: false,
      dueAt: new Date(),
      nextDueAt,
      completedAt: null,
      lastCompletedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jest.mocked(prisma.reminder.findFirst).mockResolvedValue(reminder);
    jest.mocked(prisma.reminder.update).mockResolvedValue(reminder);

    await service.complete('workspace-id', 'reminder-id', 'user-id');

    expect(prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: 'reminder-id' },
      data: { lastCompletedAt: expect.any(Date) },
    });
  });
});
