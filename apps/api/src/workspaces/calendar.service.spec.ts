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
  const service = new CalendarService({
    calendarEvent: { findFirst, findMany, create, update, delete: deleteEvent, deleteMany },
  } as never, { authorizeWorkspace } as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates a personal event and validates end after start', async () => {
    create.mockResolvedValue(event);
    await expect(service.createPersonal('user-1', {
      title: '  Review ', startsAt: '2026-11-10T10:00:00Z', endsAt: '2026-11-10T11:00:00Z', allDay: false,
    })).resolves.toBe(event);
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
    await expect(service.listWorkspace('workspace-1', 'staff-1')).resolves.toEqual([event]);
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
});
