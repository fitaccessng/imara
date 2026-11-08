import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PlatformAnnouncementEmailStatus } from '@prisma/client';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 25;
const STALE_DELIVERY_MS = 15 * 60 * 1000;

@Injectable()
export class AnnouncementDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.ANNOUNCEMENT_DELIVERY_INTERVAL_MS ?? 5000);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
      throw new Error('ANNOUNCEMENT_DELIVERY_INTERVAL_MS must be an integer of at least 1000');
    }
    this.timer = setInterval(() => {
      void this.processPending().catch((error: unknown) => {
        this.logger.error(
          `Announcement delivery batch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }, intervalMs);
    this.timer.unref();
    void this.processPending().catch((error: unknown) => {
      this.logger.error(
        `Announcement delivery batch failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
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
      const deliveries = await this.prisma.platformAnnouncementDelivery.findMany({
        where: { emailStatus: PlatformAnnouncementEmailStatus.PENDING },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: {
          id: true,
          announcement: { select: { title: true, body: true } },
          user: { select: { email: true } },
        },
      });

      for (const delivery of deliveries) {
        const claimed = await this.prisma.platformAnnouncementDelivery.updateMany({
          where: {
            id: delivery.id,
            emailStatus: PlatformAnnouncementEmailStatus.PENDING,
          },
          data: {
            emailStatus: PlatformAnnouncementEmailStatus.SENDING,
            emailAttempts: { increment: 1 },
          },
        });
        if (!claimed.count) continue;

        try {
          if (!this.mailer.isSmtpConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
          await this.mailer.sendPlatformAnnouncement(
            delivery.user.email,
            delivery.announcement.title,
            delivery.announcement.body,
          );
          await this.prisma.platformAnnouncementDelivery.update({
            where: { id: delivery.id },
            data: {
              emailStatus: PlatformAnnouncementEmailStatus.SENT,
              emailSentAt: new Date(),
              emailLastError: null,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error && error.message === 'SMTP_NOT_CONFIGURED'
            ? 'SMTP is not configured'
            : 'Email delivery failed';
          await this.prisma.platformAnnouncementDelivery.update({
            where: { id: delivery.id },
            data: {
              emailStatus: PlatformAnnouncementEmailStatus.FAILED,
              emailLastError: errorMessage,
            },
          });
          this.logger.warn(`Announcement email delivery failed for record ${delivery.id}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async requeueStaleDeliveries(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_DELIVERY_MS);
    await this.prisma.platformAnnouncementDelivery.updateMany({
      where: {
        emailStatus: PlatformAnnouncementEmailStatus.SENDING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        emailStatus: PlatformAnnouncementEmailStatus.PENDING,
        emailLastError: 'A prior delivery attempt did not finish',
      },
    });
  }
}
