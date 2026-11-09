import 'reflect-metadata';

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    error() {}
    warn() {}
  },
}));

import { ReminderRecurrence } from '@prisma/client';
import type { MailerService } from '../auth/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReminderDeliveryWorker } from './reminder-delivery.worker';

describe('ReminderDeliveryWorker', () => {
  const tx = {
    reminder: { updateMany: jest.fn() },
    reminderDelivery: { createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    reminder: { findMany: jest.fn() },
    reminderDelivery: { updateMany: jest.fn(), findMany: jest.fn() },
  } as unknown as PrismaService;
  const mailer = { isConfigured: jest.fn(), isSmtpConfigured: jest.fn(), sendReminderEmail: jest.fn() } as unknown as MailerService;
  const worker = new ReminderDeliveryWorker(prisma, mailer);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
    jest.clearAllMocks();
    jest.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    jest.mocked(prisma.reminderDelivery.findMany).mockResolvedValue([]);
    jest.mocked(prisma.reminderDelivery.updateMany).mockResolvedValue({ count: 0 });
    jest.mocked(tx.reminder.updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(tx.reminderDelivery.createMany).mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues a due recurring occurrence once and advances to the next date', async () => {
    const scheduledFor = new Date('2026-01-01T09:00:00.000Z');
    jest.mocked(prisma.reminder.findMany).mockResolvedValue([{
      id: 'reminder-id',
      workspaceId: 'workspace-id',
      createdById: 'owner-id',
      assignedToId: 'assignee-id',
      title: 'Review report',
      description: null,
      dueAt: scheduledFor,
      nextDueAt: scheduledFor,
      recurrence: ReminderRecurrence.DAILY,
      emailEnabled: false,
      approvalRequestId: null,
      signatureSignerId: null,
      completedAt: null,
      lastCompletedAt: null,
      cancelledAt: null,
      createdAt: scheduledFor,
      updatedAt: scheduledFor,
    }]);

    await worker.processPending();

    expect(tx.reminder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reminder-id',
        nextDueAt: scheduledFor,
        completedAt: null,
        cancelledAt: null,
      },
      data: { nextDueAt: new Date('2026-01-02T09:00:00.000Z') },
    });
    expect(tx.reminderDelivery.createMany).toHaveBeenCalledWith({
      data: [{
        reminderId: 'reminder-id',
        scheduledFor,
        emailStatus: 'NOT_REQUESTED',
      }],
      skipDuplicates: true,
    });
  });
});
