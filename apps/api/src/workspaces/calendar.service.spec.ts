jest.mock('@nestjs/common', () => {
  class HttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: HttpException,
    ForbiddenException: HttpException,
    NotFoundException: HttpException,
  };
});

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  const event = {
    id: 'event-1', workspaceId: 'workspace-1', createdById: 'staff-1',
    startsAt: new Date('2026-11-10T10:00:00Z'), endsAt: new Date('2026-11-10T11:00:00Z'),
    title: 'Review', description: null, allDay: false,
  };
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const deleteEvent = jest.fn();
  const deleteMany = jest.fn();
  const authorizeWorkspace = jest.fn();
  const activeMembers = jest.fn();
  const dispatchFindMany = jest.fn();
  const dispatchUpdateMany = jest.fn();
  const recipientUpdateMany = jest.fn();
  const tagDeleteMany = jest.fn();
  const tagCreateMany = jest.fn();
  const transaction = {
    calendarEvent: { update },
    calendarReminderDispatch: { findMany: dispatchFindMany, updateMany: dispatchUpdateMany },
    calendarReminderRecipient: { updateMany: recipientUpdateMany },
    calendarEventTag: { deleteMany: tagDeleteMany, createMany: tagCreateMany },
  };
  const service = new CalendarService({
    calendarEvent: { findFirst, findMany, create, update, delete: deleteEvent, deleteMany },
    workspaceMember: { findMany: activeMembers },
    $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as never, { authorizeWorkspace } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    activeMembers.mockResolvedValue([]);
    dispatchFindMany.mockResolvedValue([]);
  });

  it('creates a personal event and validates end after start', async () => {
    create.mockResolvedValue(event);
    await expect(service.createPersonal('user-1', {
      title: '  Review ', startsAt: '2026-11-10T10:00:00Z', endsAt: '2026-11-10T11:00:00Z', allDay: false,
    })).resolves.toMatchObject({ ...event, taggedUserIds: [], taggedUsers: [] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: 'user-1', title: 'Review' }),
    }));
    await expect(service.createPersonal('user-1', {
      title: 'Invalid', startsAt: '2026-11-10T11:00:00Z', endsAt: '2026-11-10T10:00:00Z', allDay: false,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restricts personal event updates to their creator', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.updatePersonal('other-user', 'event-1', { title: 'Updated' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows active workspace members to view shared events', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF, status: WorkspaceMemberStatus.ACTIVE });
    findMany.mockResolvedValue([event]);
    await expect(service.listWorkspace('workspace-1', 'staff-1'))
      .resolves.toEqual([{ ...event, taggedUserIds: [], taggedUsers: [] }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace-1' } }));
  });

  it('lets administrators edit any event but limits staff to their own', async () => {
    findFirst.mockResolvedValue(event);
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF, status: WorkspaceMemberStatus.ACTIVE });
    await expect(service.updateWorkspace('workspace-1', 'staff-2', 'event-1', { title: 'Updated' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.ADMIN, status: WorkspaceMemberStatus.ACTIVE });
    update.mockResolvedValue({ ...event, title: 'Updated' });
    await expect(service.updateWorkspace('workspace-1', 'admin-1', 'event-1', { title: 'Updated' }))
      .resolves.toMatchObject({ title: 'Updated' });
  });

  it('schedules a personal reminder in minutes before the event start', async () => {
    create.mockResolvedValue(event);
    const result = await service.createPersonal('user-1', {
      title: 'Review',
      startsAt: '2026-11-10T10:00:00Z',
      endsAt: '2026-11-10T11:00:00Z',
      allDay: false,
      reminderMinutesBefore: 15,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reminderMinutesBefore: 15,
        reminderAt: new Date('2026-11-10T09:45:00.000Z'),
      }),
    }));
    expect(result).toMatchObject({ taggedUserIds: [], taggedUsers: [] });
  });

  it('rejects reminder offsets outside the selectable choices', async () => {
    await expect(service.createPersonal('user-1', {
      title: 'Review',
      startsAt: '2026-11-10T10:00:00Z',
      endsAt: '2026-11-10T11:00:00Z',
      allDay: false,
      reminderMinutesBefore: 10,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the requested tagged user profile shape', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF, status: WorkspaceMemberStatus.ACTIVE });
    activeMembers.mockResolvedValue([{ userId: 'tagged-user' }]);
    create.mockResolvedValue({
      ...event,
      taggedUsers: [{ user: { id: 'tagged-user', name: 'Taylor Staff', email: 'taylor@example.test' } }],
    });
    const result = await service.createWorkspace('workspace-1', 'staff-1', {
      title: 'Review',
      startsAt: '2026-11-10T10:00:00Z',
      endsAt: '2026-11-10T11:00:00Z',
      allDay: false,
      taggedUserIds: ['tagged-user'],
    });
    expect(result).toMatchObject({
      taggedUserIds: ['tagged-user'],
      taggedUsers: [{ id: 'tagged-user', name: 'Taylor Staff', email: 'taylor@example.test' }],
    });
  });

  it('accepts tagged recipients only when they are active members of that workspace', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF, status: WorkspaceMemberStatus.ACTIVE });
    activeMembers.mockResolvedValue([]);
    await expect(service.createWorkspace('workspace-1', 'staff-1', {
      title: 'Review',
      startsAt: '2026-11-10T10:00:00Z',
      endsAt: '2026-11-10T11:00:00Z',
      allDay: false,
      taggedUserIds: ['other-user'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('cancels the previous dispatch and bumps the revision when rescheduling', async () => {
    findFirst.mockResolvedValue({ ...event, reminderMinutesBefore: 15, reminderRevision: 0 });
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.ADMIN, status: WorkspaceMemberStatus.ACTIVE });
    dispatchFindMany.mockResolvedValue([{ id: 'dispatch-1' }]);
    update.mockResolvedValue({ ...event, reminderMinutesBefore: 30 });
    await service.updateWorkspace('workspace-1', 'admin-1', 'event-1', {
      startsAt: '2026-11-11T10:00:00Z',
      endsAt: '2026-11-11T11:00:00Z',
      reminderMinutesBefore: 30,
    });
    expect(dispatchUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['dispatch-1'] } },
      data: { status: 'CANCELLED' },
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reminderMinutesBefore: 30,
        reminderAt: new Date('2026-11-11T09:30:00.000Z'),
        reminderRevision: { increment: 1 },
      }),
    }));
  });
});
