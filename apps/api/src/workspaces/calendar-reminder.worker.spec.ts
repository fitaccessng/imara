jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    error() {}
    warn() {}
  },
}));

import { CalendarReminderDispatchKind, CalendarReminderStatus, WorkspaceMemberStatus } from '@prisma/client';
import type { MailerService } from '../auth/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CalendarReminderWorker } from './calendar-reminder.worker';

describe('CalendarReminderWorker', () => {
  const eventUpdateMany = jest.fn();
  const memberFindMany = jest.fn();
  const dispatchCreate = jest.fn();
  const dispatchFindMany = jest.fn();
  const dispatchUpdateMany = jest.fn();
  const eventFindMany = jest.fn();
  const notificationCreateMany = jest.fn();
  const recipientUpdate = jest.fn();
  const emailDelivery = jest.fn();
  const eventEmailDelivery = jest.fn();
  const transaction = {
    calendarEvent: { updateMany: eventUpdateMany },
    workspaceMember: { findMany: memberFindMany },
    calendarReminderDispatch: { create: dispatchCreate },
    notification: { createMany: notificationCreateMany },
    calendarReminderRecipient: { update: recipientUpdate },
  };
  const prisma = {
    calendarEvent: { findMany: eventFindMany, updateMany: eventUpdateMany },
    calendarReminderDispatch: { findMany: dispatchFindMany, updateMany: dispatchUpdateMany },
    calendarReminderRecipient: { update: recipientUpdate },
    $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const worker = new CalendarReminderWorker(
    prisma,
    {
      sendCalendarEventReminderEmail: emailDelivery,
      sendCalendarEventNotificationEmail: eventEmailDelivery,
    } as unknown as MailerService,
  );
  const scheduledFor = new Date('2026-11-12T10:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    eventUpdateMany.mockResolvedValue({ count: 1 });
    memberFindMany.mockResolvedValue([{ userId: 'owner-id' }, { userId: 'tagged-id' }]);
    dispatchCreate.mockResolvedValue({});
    dispatchFindMany.mockResolvedValue([]);
    dispatchUpdateMany.mockResolvedValue({ count: 1 });
    notificationCreateMany.mockResolvedValue({ count: 1 });
    recipientUpdate.mockResolvedValue({});
    emailDelivery.mockResolvedValue(undefined);
    eventEmailDelivery.mockResolvedValue(undefined);
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
        kind: CalendarReminderDispatchKind.REMINDER,
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

  it('persists an in-app notification for the recipient in the correct personal or workspace scope', async () => {
    const recipient = {
      id: 'recipient-id',
      userId: 'tagged-id',
      dispatchId: 'dispatch-id',
      dispatch: {
        kind: CalendarReminderDispatchKind.REMINDER,
        event: {
          id: 'event-id',
          title: 'Review',
          startsAt: scheduledFor,
          endsAt: new Date(scheduledFor.getTime() + 60 * 60 * 1000),
          workspaceId: 'workspace-id',
        },
      },
    };

    await (worker as any).deliverInApp(recipient);

    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [{
        workspaceId: 'workspace-id',
        userId: 'tagged-id',
        type: 'CALENDAR_EVENT_REMINDER',
        message: 'Event reminder: Review',
        sourceKey: 'calendar-event-reminder:dispatch-id:tagged-id',
        metadata: {
          eventId: 'event-id',
          startsAt: scheduledFor.toISOString(),
          endsAt: new Date(scheduledFor.getTime() + 60 * 60 * 1000).toISOString(),
          workspaceId: 'workspace-id',
        },
      }],
      skipDuplicates: true,
    });
    expect(recipientUpdate).toHaveBeenCalledWith({
      where: { id: 'recipient-id' },
      data: { inAppStatus: 'SENT', lastError: null },
    });
  });

  it('creates an in-app shared-event notification independently of its reminder', async () => {
    const recipient = {
      id: 'recipient-id',
      userId: 'tagged-id',
      dispatchId: 'dispatch-id',
      dispatch: {
        kind: CalendarReminderDispatchKind.EVENT_CREATED,
        event: {
          id: 'event-id',
          title: 'Review',
          startsAt: scheduledFor,
          endsAt: new Date(scheduledFor.getTime() + 60 * 60 * 1000),
          workspaceId: 'workspace-id',
        },
      },
    };

    await (worker as any).deliverInApp(recipient);

    expect(notificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [{
        workspaceId: 'workspace-id',
        userId: 'tagged-id',
        type: 'CALENDAR_EVENT_SHARED',
        message: 'New calendar event: Review',
        sourceKey: 'calendar-event-event_created:dispatch-id:tagged-id',
        metadata: expect.objectContaining({ eventId: 'event-id', workspaceId: 'workspace-id' }),
      }],
      skipDuplicates: true,
    }));
  });

  it('sends email to the recipient address and marks the email channel sent only after acceptance', async () => {
    const recipient = {
      id: 'recipient-id',
      user: { email: 'tagged@example.test' },
      dispatch: {
        kind: CalendarReminderDispatchKind.REMINDER,
        event: {
          id: 'event-id',
          title: 'Review',
          description: 'Bring the report',
          workspaceId: 'workspace-id',
        },
      },
    };

    await (worker as any).deliverEmail(recipient);

    expect(emailDelivery).toHaveBeenCalledWith(
      'tagged@example.test',
      'Review',
      'Bring the report',
      'event-id',
      'workspace-id',
    );
    expect(recipientUpdate).toHaveBeenCalledWith({
      where: { id: 'recipient-id' },
      data: { emailStatus: 'SENT', lastError: null },
    });
  });

  it('leaves a rejected email unmarked so the delivery worker can retry it', async () => {
    emailDelivery.mockRejectedValueOnce(new Error('SMTP did not accept the recipient'));
    const recipient = {
      id: 'recipient-id',
      user: { email: 'tagged@example.test' },
      dispatch: {
        kind: CalendarReminderDispatchKind.REMINDER,
        event: {
          id: 'event-id',
          title: 'Review',
          description: null,
          workspaceId: 'workspace-id',
        },
      },
    };

    await expect((worker as any).deliverEmail(recipient))
      .rejects.toThrow('SMTP did not accept the recipient');

    expect(recipientUpdate).not.toHaveBeenCalled();
  });

  it('uses the immediate event notification email path for a shared-event send', async () => {
    const recipient = {
      id: 'recipient-id',
      user: { email: 'tagged@example.test' },
      dispatch: {
        kind: CalendarReminderDispatchKind.EVENT_CREATED,
        event: {
          id: 'event-id',
          title: 'Review',
          description: 'Bring the report',
          workspaceId: 'workspace-id',
        },
      },
    };

    await (worker as any).deliverEmail(recipient);

    expect(eventEmailDelivery).toHaveBeenCalledWith(
      'tagged@example.test',
      'Review',
      'Bring the report',
      'event-id',
      'workspace-id',
      true,
    );
    expect(emailDelivery).not.toHaveBeenCalled();
    expect(recipientUpdate).toHaveBeenCalledWith({
      where: { id: 'recipient-id' },
      data: { emailStatus: 'SENT', lastError: null },
    });
  });

  it('finalizes immediate event notifications without changing the scheduled reminder status', async () => {
    dispatchFindMany.mockResolvedValue([{
      id: 'dispatch-id',
      eventId: 'event-id',
      revision: 1,
      kind: CalendarReminderDispatchKind.EVENT_CREATED,
      recipients: [{ inAppStatus: 'SENT', emailStatus: 'SENT' }],
    }]);

    await (worker as any).finalizeDispatches();

    expect(dispatchUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dispatch-id', status: { not: CalendarReminderStatus.CANCELLED } },
      data: expect.objectContaining({ status: CalendarReminderStatus.SENT }),
    }));
    expect(eventUpdateMany).not.toHaveBeenCalled();
  });
});
