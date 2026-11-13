import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CalendarReminderChannelStatus as ChannelStatus,
  CalendarReminderStatus as DispatchStatus,
  WorkspaceMemberStatus,
} from '@prisma/client';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 25;
const STALE_DELIVERY_MS = 15 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const TERMINAL_CHANNEL_STATUSES: ChannelStatus[] = [
  ChannelStatus.SENT,
  ChannelStatus.CANCELLED,
];

type Channel = 'inAppStatus' | 'emailStatus';
type ChannelAttempt = 'inAppAttemptAt' | 'emailAttemptAt';

const CHANNEL_ATTEMPT_FIELD: Record<Channel, ChannelAttempt> = {
  inAppStatus: 'inAppAttemptAt',
  emailStatus: 'emailAttemptAt',
};

@Injectable()
export class CalendarReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarReminderWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.CALENDAR_REMINDER_DELIVERY_INTERVAL_MS ?? 30000);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
      throw new Error('CALENDAR_REMINDER_DELIVERY_INTERVAL_MS must be an integer of at least 1000');
    }
    this.timer = setInterval(() => {
      void this.processPending().catch((error: unknown) => {
        this.logger.error(`Calendar reminder batch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }, intervalMs);
    this.timer.unref();
    void this.processPending().catch((error: unknown) => {
      this.logger.error(`Calendar reminder batch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.recoverStaleWork();
      await this.queueDueEvents();
      await this.deliverChannel('inAppStatus');
      await this.deliverChannel('emailStatus');
      await this.finalizeDispatches();
    } finally {
      this.running = false;
    }
  }

  private async queueDueEvents(): Promise<void> {
    const dueEvents = await this.prisma.calendarEvent.findMany({
      where: {
        reminderStatus: DispatchStatus.PENDING,
        reminderAt: { lte: new Date() },
        reminderMinutesBefore: { not: null },
      },
      orderBy: [{ reminderAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      include: { taggedUsers: { select: { userId: true } } },
    });

    for (const event of dueEvents) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.calendarEvent.updateMany({
          where: {
            id: event.id,
            reminderRevision: event.reminderRevision,
            reminderAt: event.reminderAt,
            reminderStatus: DispatchStatus.PENDING,
          },
          data: { reminderStatus: DispatchStatus.SENDING },
        });
        if (!claimed.count || !event.reminderAt) return;

        const candidateIds = event.workspaceId
          ? [...new Set([event.createdById, ...event.taggedUsers.map((tag: { userId: string }) => tag.userId)])]
          : [event.createdById];
        const recipientIds = event.workspaceId
          ? (await tx.workspaceMember.findMany({
            where: {
              workspaceId: event.workspaceId,
              userId: { in: candidateIds },
              status: WorkspaceMemberStatus.ACTIVE,
            },
            select: { userId: true },
          })).map((member: { userId: string }) => member.userId)
          : candidateIds;

        await tx.calendarReminderDispatch.create({
          data: {
            eventId: event.id,
            revision: event.reminderRevision,
            scheduledFor: event.reminderAt,
            recipients: {
              createMany: {
                data: recipientIds.map((userId: string) => ({ userId })),
              },
            },
          },
        });
      });
    }
  }

  private async deliverChannel(channel: Channel): Promise<void> {
    const recipients = await this.prisma.calendarReminderRecipient.findMany({
      where: { [channel]: ChannelStatus.PENDING },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      include: {
        user: { select: { id: true, email: true } },
        dispatch: { include: { event: true } },
      },
    });

    for (const recipient of recipients) {
      const claimed = await this.prisma.calendarReminderRecipient.updateMany({
        where: { id: recipient.id, [channel]: ChannelStatus.PENDING },
        data: { [channel]: ChannelStatus.SENDING, [CHANNEL_ATTEMPT_FIELD[channel]]: new Date() },
      });
      if (!claimed.count) continue;

      try {
        const event = await this.currentEventForRecipient(recipient);
        if (!event) {
          await this.setChannelStatus(recipient.id, channel, ChannelStatus.CANCELLED);
          continue;
        }
        recipient.dispatch.event = event;
        if (channel === 'inAppStatus') {
          await this.deliverInApp(recipient);
        } else {
          await this.deliverEmail(recipient);
        }
      } catch (error) {
        await this.setChannelStatus(
          recipient.id,
          channel,
          ChannelStatus.FAILED,
          error instanceof Error ? error.message.slice(0, 255) : 'Delivery failed',
        );
        this.logger.warn(`Calendar reminder ${channel} delivery failed for recipient ${recipient.id}`);
      }
    }
  }

  private async currentEventForRecipient(recipient: any): Promise<any | null> {
    const { dispatch, user } = recipient;
    const current = await this.prisma.calendarReminderDispatch.findFirst({
      where: {
        id: dispatch.id,
        status: { in: [DispatchStatus.PENDING, DispatchStatus.SENDING, DispatchStatus.FAILED] },
      },
      include: { event: true },
    });
    if (
      !current ||
      current.event.reminderRevision !== current.revision ||
      current.event.reminderAt?.getTime() !== current.scheduledFor.getTime()
    ) return null;
    if (!current.event.workspaceId) return user.id === current.event.createdById ? current.event : null;
    const member = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId: current.event.workspaceId,
        userId: user.id,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    return member ? current.event : null;
  }

  private async deliverInApp(recipient: any): Promise<void> {
    const event = recipient.dispatch.event;
    const message = `Event reminder: ${event.title}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: [{
          workspaceId: event.workspaceId,
          userId: recipient.userId,
          type: 'CALENDAR_EVENT_REMINDER',
          message,
          sourceKey: `calendar-event-reminder:${recipient.dispatchId}:${recipient.userId}`,
          metadata: {
            eventId: event.id,
            startsAt: event.startsAt.toISOString(),
            workspaceId: event.workspaceId,
          },
        }],
        skipDuplicates: true,
      });
      await tx.calendarReminderRecipient.update({
        where: { id: recipient.id },
        data: { inAppStatus: ChannelStatus.SENT, lastError: null },
      });
    });
  }

  private async deliverEmail(recipient: any): Promise<void> {
    const event = recipient.dispatch.event;
    await this.mailer.sendCalendarEventReminderEmail(
      recipient.user.email,
      event.title,
      event.description ?? '',
      event.id,
      event.workspaceId,
    );
    await this.setChannelStatus(recipient.id, 'emailStatus', ChannelStatus.SENT);
  }

  private async setChannelStatus(
    recipientId: string,
    channel: Channel,
    status: ChannelStatus,
    error?: string,
  ): Promise<void> {
    await this.prisma.calendarReminderRecipient.update({
      where: { id: recipientId },
      data: { [channel]: status, ...(error ? { lastError: error } : { lastError: null }) },
    });
  }

  private async finalizeDispatches(): Promise<void> {
    const dispatches = await this.prisma.calendarReminderDispatch.findMany({
      where: { status: { in: [DispatchStatus.PENDING, DispatchStatus.SENDING] } },
      take: BATCH_SIZE,
      include: { recipients: true },
    });
    for (const dispatch of dispatches) {
      const statuses = dispatch.recipients.flatMap((recipient: any) => [
        recipient.inAppStatus,
        recipient.emailStatus,
      ]);
      if (statuses.every((status: ChannelStatus) => TERMINAL_CHANNEL_STATUSES.includes(status))) {
        await this.prisma.calendarReminderDispatch.updateMany({
          where: { id: dispatch.id, status: { not: DispatchStatus.CANCELLED } },
          data: { status: DispatchStatus.SENT, sentAt: new Date(), lastError: null },
        });
        await this.prisma.calendarEvent.updateMany({
          where: { id: dispatch.eventId, reminderRevision: dispatch.revision },
          data: { reminderStatus: DispatchStatus.SENT },
        });
      } else if (statuses.some((status: ChannelStatus) => status === ChannelStatus.FAILED)) {
        await this.prisma.calendarReminderDispatch.updateMany({
          where: { id: dispatch.id, status: { not: DispatchStatus.CANCELLED } },
          data: { status: DispatchStatus.FAILED, lastError: 'One or more reminder channels need retry' },
        });
        await this.prisma.calendarEvent.updateMany({
          where: { id: dispatch.eventId, reminderRevision: dispatch.revision },
          data: { reminderStatus: DispatchStatus.FAILED },
        });
      } else {
        await this.prisma.calendarReminderDispatch.updateMany({
          where: { id: dispatch.id, status: DispatchStatus.PENDING },
          data: { status: DispatchStatus.SENDING },
        });
      }
    }
  }

  private async recoverStaleWork(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_DELIVERY_MS);
    const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
    for (const channel of ['inAppStatus', 'emailStatus'] as const) {
      const attemptAt = CHANNEL_ATTEMPT_FIELD[channel];
      await this.prisma.calendarReminderRecipient.updateMany({
        where: { [channel]: ChannelStatus.SENDING, [attemptAt]: { lt: staleBefore } },
        data: { [channel]: ChannelStatus.PENDING, [attemptAt]: null, lastError: 'A prior notification attempt did not finish' },
      });
      await this.prisma.calendarReminderRecipient.updateMany({
        where: { [channel]: ChannelStatus.FAILED, updatedAt: { lt: retryBefore } },
        data: { [channel]: ChannelStatus.PENDING, lastError: 'Retrying a previously failed reminder channel' },
      });
    }
    await this.prisma.calendarReminderDispatch.updateMany({
      where: { status: DispatchStatus.FAILED, updatedAt: { lt: retryBefore } },
      data: { status: DispatchStatus.PENDING, attempts: { increment: 1 }, lastError: null },
    });
    await this.prisma.calendarEvent.updateMany({
      where: { reminderStatus: DispatchStatus.FAILED, reminderAt: { not: null } },
      data: { reminderStatus: DispatchStatus.SENDING },
    });
  }
}
