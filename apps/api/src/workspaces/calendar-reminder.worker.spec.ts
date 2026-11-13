jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    error() {}
    warn() {}
  },
}));

import { CalendarReminderStatus, WorkspaceMemberStatus } from '@prisma/client';
import type { MailerService } from '../auth/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CalendarReminderWorker } from './calendar-reminder.worker';

describe('CalendarReminderWorker', () => {
  const eventUpdateMany = jest.fn();
  const memberFindMany = jest.fn();
  const dispatchCreate = jest.fn();
  const eventFindMany = jest.fn();
  const transaction = {
    calendarEvent: { updateMany: eventUpdateMany },
    workspaceMember: { findMany: memberFindMany },
    calendarReminderDispatch: { create: dispatchCreate },
  };
  const prisma = {
    calendarEvent: { findMany: eventFindMany },
    $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const worker = new CalendarReminderWorker(
    prisma,
    {} as MailerService,
  );
  const scheduledFor = new Date('2026-11-12T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    eventUpdateMany.mockResolvedValue({ count: 1 });
    memberFindMany.mockResolvedValue([{ userId: 'owner-id' }, { userId: 'tagged-id' }]);
    dispatchCreate.mockResolvedValue({});
    eventFindMany.mockResolvedValue([{
      id: 'event-id',
      createdById: 'owner-id',
      workspaceId: 'workspace-id',
      reminderAt: scheduledFor,
      reminderRevision: 3,
      reminderStatus: CalendarReminderStatus.PENDING,
      taggedUsers: [{ userId: 'tagged-id' }, { userId: 'inactive-id' }],
    }]);
  });

  it('claims a due revision once and snapshots only active workspace recipients', async () => {
    await (worker as any).queueDueEvents();
    expect(eventUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'event-id',
        reminderRevision: 3,
        reminderAt: scheduledFor,
        reminderStatus: CalendarReminderStatus.PENDING,
      },
      data: { reminderStatus: CalendarReminderStatus.SENDING },
    });
    expect(memberFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-id',
        userId: { in: ['owner-id', 'tagged-id', 'inactive-id'] },
        status: WorkspaceMemberStatus.ACTIVE,
      },
      select: { userId: true },
    });
    expect(dispatchCreate).toHaveBeenCalledWith({
      data: {
        eventId: 'event-id',
        revision: 3,
        scheduledFor,
        recipients: { createMany: { data: [{ userId: 'owner-id' }, { userId: 'tagged-id' }] } },
      },
    });
  });

  it('does not create another dispatch when a concurrent worker already claimed the event', async () => {
    eventUpdateMany.mockResolvedValue({ count: 0 });
    await (worker as any).queueDueEvents();
    expect(dispatchCreate).not.toHaveBeenCalled();
    expect(memberFindMany).not.toHaveBeenCalled();
  });
});
