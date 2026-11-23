jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeetingsService } from './meetings.service';

describe('MeetingsService', () => {
  const authorizeWorkspace = jest.fn();
  const requireWriteAccess = jest.fn();
  const storedFileFindFirst = jest.fn();
  const workspaceMeetingFindMany = jest.fn();
  const workspaceMeetingFindFirst = jest.fn();
  const personalMeetingCreate = jest.fn();
  const personalMeetingFindFirstOrThrow = jest.fn();
  const personalMeetingFindFirst = jest.fn();
  const personalMeetingDeleteMany = jest.fn();
  const personalMeetingUpdateMany = jest.fn();
  const workspaceMeetingCreate = jest.fn();
  const workspaceMeetingFindFirstOrThrow = jest.fn();
  const calendarEventFindFirst = jest.fn();
  const calendarEventUpdateMany = jest.fn();
  const actionItemFindFirst = jest.fn();
  const workspaceTaskCreate = jest.fn();
  const actionItemUpdateMany = jest.fn();
  const tx = {
    meetingActionItem: { findFirst: actionItemFindFirst, updateMany: actionItemUpdateMany },
    workspaceTask: { create: workspaceTaskCreate, findFirstOrThrow: jest.fn(), deleteMany: jest.fn() },
    calendarEvent: { updateMany: calendarEventUpdateMany },
    personalMeeting: {
      create: personalMeetingCreate,
      findFirstOrThrow: personalMeetingFindFirstOrThrow,
      updateMany: personalMeetingUpdateMany,
      deleteMany: personalMeetingDeleteMany,
    },
    workspaceMeeting: { create: workspaceMeetingCreate, findFirstOrThrow: workspaceMeetingFindFirstOrThrow },
  };
  const prisma = {
    storedFile: { findFirst: storedFileFindFirst },
    calendarEvent: { findFirst: calendarEventFindFirst },
    workspaceMeeting: {
      findMany: workspaceMeetingFindMany, findFirst: workspaceMeetingFindFirst, create: workspaceMeetingCreate,
    },
    workspaceMember: { findMany: jest.fn() },
    personalMeeting: {
      findMany: jest.fn(), findFirst: personalMeetingFindFirst, create: personalMeetingCreate,
    },
    meetingActionItem: { findFirst: actionItemFindFirst },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new MeetingsService(
    prisma as never,
    { authorizeWorkspace } as never,
    { requireWriteAccess } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    authorizeWorkspace.mockResolvedValue({ status: 'ACTIVE' });
    requireWriteAccess.mockResolvedValue(undefined);
    workspaceMeetingFindFirst.mockResolvedValue({ id: 'meeting-a' });
  });

  it('requires active workspace membership before listing any workspace records', async () => {
    authorizeWorkspace.mockResolvedValue({ status: 'SUSPENDED' });
    await expect(service.listWorkspace('workspace-a', 'user-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(workspaceMeetingFindMany).not.toHaveBeenCalled();
  });

  it('allows only ready same-scope recording files', async () => {
    storedFileFindFirst.mockResolvedValue(null);
    await expect(service.createWorkspace('workspace-a', 'user-a', {
      title: 'Planning', transcript: 'Manually entered transcript', recordingFileId: 'foreign-file',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storedFileFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'foreign-file', workspaceId: 'workspace-a', status: 'READY', deletedAt: null,
        eventId: null, fileRequestId: null,
      }),
    }));
    expect(requireWriteAccess).toHaveBeenCalledWith('workspace-a');
  });

  it('converts an action item into the existing workspace task model exactly once', async () => {
    actionItemFindFirst.mockResolvedValue({
      id: 'action-a', title: 'Send the report', description: 'Draft it', dueAt: null,
      assigneeUserId: null, workspaceTaskId: null,
    });
    workspaceTaskCreate.mockResolvedValue({ id: 'task-a', title: 'Send the report' });
    actionItemUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.createWorkspaceActionTask('workspace-a', 'user-a', 'meeting-a', 'action-a'))
      .resolves.toEqual({ id: 'task-a', title: 'Send the report' });
    expect(workspaceTaskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a', creatorId: 'user-a', title: 'Send the report', description: 'Draft it',
      }),
    });
    expect(actionItemUpdateMany).toHaveBeenCalledWith({
      where: { id: 'action-a', workspaceTaskId: null }, data: { workspaceTaskId: 'task-a' },
    });
  });

  it('only links a personal meeting to an unlinked event in the owner personal calendar', async () => {
    calendarEventFindFirst.mockResolvedValue({ id: 'event-a' });
    personalMeetingCreate.mockResolvedValue({ id: 'meeting-a' });
    personalMeetingFindFirstOrThrow.mockResolvedValue({
      id: 'meeting-a', recordingFile: null, calendarEvent: { id: 'event-a' },
    });
    calendarEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.createPersonal('user-a', {
      title: 'Planning', transcript: '', calendarEventId: 'event-a',
    })).resolves.toMatchObject({ calendarEventId: 'event-a' });
    expect(calendarEventFindFirst).toHaveBeenCalledWith({
      where: { id: 'event-a', createdById: 'user-a', workspaceId: null, personalMeetingId: null },
      select: { id: true },
    });
    expect(calendarEventUpdateMany).toHaveBeenCalledWith({
      where: { id: 'event-a', createdById: 'user-a', workspaceId: null, personalMeetingId: null },
      data: { personalMeetingId: 'meeting-a' },
    });
  });

  it('rejects a foreign calendar event before creating the meeting', async () => {
    calendarEventFindFirst.mockResolvedValue(null);
    await expect(service.createPersonal('user-a', {
      title: 'Planning', transcript: '', calendarEventId: 'foreign-event',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(calendarEventFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ createdById: 'user-a', workspaceId: null }),
    }));
    expect(personalMeetingCreate).not.toHaveBeenCalled();
  });

  it('links a workspace meeting only to an event in that workspace', async () => {
    calendarEventFindFirst.mockResolvedValue({ id: 'event-a' });
    workspaceMeetingCreate.mockResolvedValue({ id: 'meeting-a' });
    workspaceMeetingFindFirstOrThrow.mockResolvedValue({
      id: 'meeting-a', recordingFile: null, calendarEvent: { id: 'event-a' },
    });
    calendarEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.createWorkspace('workspace-a', 'user-a', {
      title: 'Planning', transcript: '', calendarEventId: 'event-a',
    })).resolves.toMatchObject({ calendarEventId: 'event-a' });
    expect(calendarEventFindFirst).toHaveBeenCalledWith({
      where: { id: 'event-a', workspaceId: 'workspace-a', workspaceMeetingId: null },
      select: { id: true },
    });
    expect(calendarEventUpdateMany).toHaveBeenCalledWith({
      where: { id: 'event-a', workspaceId: 'workspace-a', workspaceMeetingId: null },
      data: { workspaceMeetingId: 'meeting-a' },
    });
  });

  it('clears a meeting calendar link when update sends null', async () => {
    personalMeetingFindFirst.mockResolvedValue({
      id: 'meeting-a', userId: 'user-a', title: 'Planning', startedAt: null, endedAt: null,
      transcript: '', summary: null, decisions: [], recordingFileId: null,
      calendarEvent: { id: 'event-a' },
    });
    personalMeetingUpdateMany.mockResolvedValue({ count: 1 });
    personalMeetingFindFirstOrThrow.mockResolvedValue({
      id: 'meeting-a', recordingFile: null, calendarEvent: null,
    });
    calendarEventUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.updatePersonal('user-a', 'meeting-a', { calendarEventId: null }))
      .resolves.toMatchObject({ calendarEventId: null });
    expect(calendarEventUpdateMany).toHaveBeenCalledWith({
      where: { id: 'event-a', createdById: 'user-a', workspaceId: null, personalMeetingId: 'meeting-a' },
      data: { personalMeetingId: null },
    });
  });

  it('releases the calendar event link when a linked personal meeting is deleted', async () => {
    personalMeetingFindFirst.mockResolvedValue({
      id: 'meeting-a', calendarEvent: { id: 'event-a' },
    });
    calendarEventUpdateMany.mockResolvedValue({ count: 1 });
    personalMeetingDeleteMany.mockResolvedValue({ count: 1 });

    await service.deletePersonal('user-a', 'meeting-a');
    expect(calendarEventUpdateMany).toHaveBeenCalledWith({
      where: { id: 'event-a', createdById: 'user-a', workspaceId: null, personalMeetingId: 'meeting-a' },
      data: { personalMeetingId: null },
    });
    expect(personalMeetingDeleteMany).toHaveBeenCalledWith({ where: { id: 'meeting-a', userId: 'user-a' } });
  });
});
