import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ApprovalRequestStatus, PlatformAnnouncementEmailStatus, ReminderDeliveryStatus, ReminderRecurrence } from '@prisma/client';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 25;
const STALE_DELIVERY_MS = 15 * 60 * 1000;

function nextOccurrence(date: Date, recurrence: ReminderRecurrence, from: Date): Date | null {
  if (recurrence === ReminderRecurrence.ONCE) return null;
  const next = new Date(date);
  if (recurrence === ReminderRecurrence.DAILY) next.setUTCDate(next.getUTCDate() + 1);
  if (recurrence === ReminderRecurrence.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
  if (recurrence === ReminderRecurrence.MONTHLY) {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  while (next <= from) {
    if (recurrence === ReminderRecurrence.DAILY) next.setUTCDate(next.getUTCDate() + 1);
    if (recurrence === ReminderRecurrence.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
    if (recurrence === ReminderRecurrence.MONTHLY) {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
    }
  }
  return next;
}

@Injectable()
export class ReminderDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.REMINDER_DELIVERY_INTERVAL_MS ?? 30000);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
      throw new Error('REMINDER_DELIVERY_INTERVAL_MS must be an integer of at least 1000');
    }
    this.timer = setInterval(() => {
      void this.processPending().catch((error: unknown) => {
        this.logger.error(`Reminder delivery batch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }, intervalMs);
    this.timer.unref();
    void this.processPending().catch((error: unknown) => {
      this.logger.error(`Reminder delivery batch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.requeueStaleDeliveries();
      await this.queueDueReminders();
      await this.deliverInApp();
      await this.deliverEmails();
    } finally {
      this.running = false;
    }
  }

  private async queueDueReminders(): Promise<void> {
    const now = new Date();
    const reminders = await this.prisma.reminder.findMany({
      where: { nextDueAt: { lte: now }, completedAt: null, cancelledAt: null },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
    });

    for (const reminder of reminders) {
      const scheduledFor = reminder.nextDueAt;
      if (!scheduledFor) continue;
      const nextDueAt = nextOccurrence(scheduledFor, reminder.recurrence, now);
      await this.prisma.$transaction(async (tx) => {
        if (reminder.approvalRequestId) {
          const approval = await tx.approvalRequest.findUnique({
            where: { id: reminder.approvalRequestId },
            select: { status: true },
          });
          if (!approval || (
            approval.status !== ApprovalRequestStatus.IN_PROGRESS
            && approval.status !== ApprovalRequestStatus.CHANGES_REQUESTED
          )) {
            await tx.reminder.updateMany({
              where: { id: reminder.id, nextDueAt: scheduledFor },
              data: { nextDueAt: null, cancelledAt: new Date() },
            });
            return;
          }
        }
        if (reminder.signatureSignerId) {
          const signer = await tx.signatureSigner.findFirst({
            where: {
              id: reminder.signatureSignerId,
              status: 'PENDING',
              request: { status: 'PENDING' },
            },
            select: { id: true },
          });
          if (!signer) {
            await tx.reminder.updateMany({
              where: { id: reminder.id, nextDueAt: scheduledFor },
              data: { nextDueAt: null, cancelledAt: new Date() },
            });
            return;
          }
        }
        const claimed = await tx.reminder.updateMany({
          where: { id: reminder.id, nextDueAt: scheduledFor, completedAt: null, cancelledAt: null },
          data: { nextDueAt },
        });
        if (!claimed.count) return;
        await tx.reminderDelivery.createMany({
          data: [{
            reminderId: reminder.id,
            scheduledFor,
            emailStatus: reminder.emailEnabled
              ? PlatformAnnouncementEmailStatus.PENDING
              : PlatformAnnouncementEmailStatus.NOT_REQUESTED,
          }],
          skipDuplicates: true,
        });
      });
    }
  }

  private async deliverInApp(): Promise<void> {
    const deliveries = await this.prisma.reminderDelivery.findMany({
      where: { status: ReminderDeliveryStatus.PENDING },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      include: { reminder: true },
    });

    for (const delivery of deliveries) {
      const claimed = await this.prisma.reminderDelivery.updateMany({
        where: { id: delivery.id, status: ReminderDeliveryStatus.PENDING },
        data: { status: ReminderDeliveryStatus.SENDING, attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;

      try {
        await this.prisma.$transaction(async (tx) => {
          const approvalOpen = delivery.reminder.approvalRequestId
            ? await tx.approvalRequest.findFirst({
              where: {
                id: delivery.reminder.approvalRequestId,
                status: { in: [ApprovalRequestStatus.IN_PROGRESS, ApprovalRequestStatus.CHANGES_REQUESTED] },
              },
              select: { id: true },
            })
            : true;
          const signerPending = delivery.reminder.signatureSignerId
            ? await tx.signatureSigner.findFirst({
              where: {
                id: delivery.reminder.signatureSignerId,
                status: 'PENDING',
                request: { status: 'PENDING' },
              },
              select: { id: true },
            })
            : true;
          if (!approvalOpen || !signerPending) {
            await tx.reminder.updateMany({
              where: { id: delivery.reminderId },
              data: { nextDueAt: null, cancelledAt: new Date() },
            });
            await tx.reminderDelivery.update({
              where: { id: delivery.id },
              data: {
                status: ReminderDeliveryStatus.SENT,
                emailStatus: PlatformAnnouncementEmailStatus.NOT_REQUESTED,
                sentAt: new Date(),
                lastError: null,
              },
            });
            return;
          }
          await tx.notification.create({
            data: {
              workspaceId: delivery.reminder.workspaceId,
              userId: delivery.reminder.assignedToId,
              type: 'REMINDER_DUE',
              message: `Reminder due: ${delivery.reminder.title}`,
              metadata: { reminderId: delivery.reminderId, deliveryId: delivery.id },
            },
          });
          await tx.reminderDelivery.update({
            where: { id: delivery.id },
            data: { status: ReminderDeliveryStatus.SENT, sentAt: new Date(), lastError: null },
          });
        });
      } catch (error) {
        await this.prisma.reminderDelivery.update({
          where: { id: delivery.id },
          data: {
            status: ReminderDeliveryStatus.FAILED,
            lastError: error instanceof Error ? error.message.slice(0, 255) : 'Notification delivery failed',
          },
        });
        this.logger.warn(`In-app reminder delivery failed for record ${delivery.id}`);
      }
    }
  }

  private async deliverEmails(): Promise<void> {
    const deliveries = await this.prisma.reminderDelivery.findMany({
      where: { emailStatus: PlatformAnnouncementEmailStatus.PENDING, status: ReminderDeliveryStatus.SENT },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      include: {
        reminder: {
          include: {
            assignee: { select: { email: true } },
          },
        },
      },
    });

    for (const delivery of deliveries) {
      const claimed = await this.prisma.reminderDelivery.updateMany({
        where: { id: delivery.id, emailStatus: PlatformAnnouncementEmailStatus.PENDING },
        data: { emailStatus: PlatformAnnouncementEmailStatus.SENDING },
      });
      if (!claimed.count) continue;
      try {
        if (!this.mailer.isConfigured()) throw new Error('SMTP is not configured');
        const url = new URL('/workspace/reminders', process.env.FRONTEND_URL ?? 'http://localhost:5173');
        url.searchParams.set('workspace', delivery.reminder.workspaceId);
        await this.mailer.sendReminderEmail(
          delivery.reminder.assignee.email,
          delivery.reminder.title,
          delivery.reminder.description ?? '',
          url,
        );
        await this.prisma.reminderDelivery.update({
          where: { id: delivery.id },
          data: { emailStatus: PlatformAnnouncementEmailStatus.SENT, lastError: null },
        });
      } catch (error) {
        await this.prisma.reminderDelivery.update({
          where: { id: delivery.id },
          data: {
            emailStatus: PlatformAnnouncementEmailStatus.FAILED,
            lastError: error instanceof Error ? error.message.slice(0, 255) : 'Email delivery failed',
          },
        });
        this.logger.warn(`Reminder email delivery failed for record ${delivery.id}`);
      }
    }
  }

  private async requeueStaleDeliveries(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_DELIVERY_MS);
    await this.prisma.reminderDelivery.updateMany({
      where: { status: ReminderDeliveryStatus.SENDING, updatedAt: { lt: staleBefore } },
      data: { status: ReminderDeliveryStatus.PENDING, lastError: 'A prior notification attempt did not finish' },
    });
    await this.prisma.reminderDelivery.updateMany({
      where: { emailStatus: PlatformAnnouncementEmailStatus.SENDING, updatedAt: { lt: staleBefore } },
      data: { emailStatus: PlatformAnnouncementEmailStatus.PENDING, lastError: 'A prior email attempt did not finish' },
    });
  }
}
