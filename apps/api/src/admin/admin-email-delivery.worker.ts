import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AdminEmailDeliveryStatus } from '@prisma/client';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 25;
const STALE_DELIVERY_MS = 15 * 60 * 1000;

function safeDeliveryError(error: unknown, recipientRejected = false): string {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; responseCode?: unknown }
    : {};
  const responseCode = typeof details.responseCode === 'number'
    && Number.isInteger(details.responseCode)
    && details.responseCode >= 400
    && details.responseCode <= 599
    ? ` (SMTP ${details.responseCode})`
    : '';
  if (recipientRejected) return `SMTP server rejected recipient${responseCode}`;
  const safeCodes = new Set([
    'EAUTH', 'ECONNECTION', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET',
    'EENVELOPE', 'ESMTP', 'EAI_AGAIN', 'ENOTFOUND',
  ]);
  const code = typeof details.code === 'string' && safeCodes.has(details.code)
    ? ` (${details.code})`
    : '';
  return `SMTP send failed${responseCode}${code}`;
}

@Injectable()
export class AdminEmailDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminEmailDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.ADMIN_EMAIL_DELIVERY_INTERVAL_MS ?? 5000);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) {
      throw new Error('ADMIN_EMAIL_DELIVERY_INTERVAL_MS must be an integer of at least 1000');
    }
    this.timer = setInterval(() => {
      void this.processPending().catch(() => {
        this.logger.error('Admin email delivery batch failed');
      });
    }, intervalMs);
    this.timer.unref();
    void this.processPending().catch(() => {
      this.logger.error('Admin email delivery batch failed');
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
      const deliveries = await this.prisma.adminEmailCampaignDelivery.findMany({
        where: { status: AdminEmailDeliveryStatus.PENDING },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        select: {
          id: true,
          campaign: { select: { subject: true, preheader: true, html: true } },
          user: { select: { email: true } },
        },
      });

      for (const delivery of deliveries) {
        const claimed = await this.prisma.adminEmailCampaignDelivery.updateMany({
          where: {
            id: delivery.id,
            status: AdminEmailDeliveryStatus.PENDING,
          },
          data: {
            status: AdminEmailDeliveryStatus.SENDING,
            attempts: { increment: 1 },
          },
        });
        if (!claimed.count) continue;

        try {
          const result = await this.mailer.sendHtmlEmail(
            delivery.user.email,
            delivery.campaign.subject,
            delivery.campaign.html,
            delivery.campaign.preheader,
          );
          if (!result.accepted) {
            await this.prisma.adminEmailCampaignDelivery.update({
              where: { id: delivery.id },
              data: {
                status: AdminEmailDeliveryStatus.FAILED,
                lastError: safeDeliveryError(
                  { responseCode: result.responseCode },
                  true,
                ),
              },
            });
            this.logger.warn(`Admin email delivery was rejected for record ${delivery.id}`);
            continue;
          }
          await this.prisma.adminEmailCampaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: AdminEmailDeliveryStatus.SENT,
              smtpAcceptedAt: new Date(),
              lastError: null,
            },
          });
        } catch (error) {
          await this.prisma.adminEmailCampaignDelivery.update({
            where: { id: delivery.id },
            data: {
              status: AdminEmailDeliveryStatus.FAILED,
              lastError: this.mailer.isSmtpConfigured()
                ? safeDeliveryError(error)
                : 'SMTP is not configured',
            },
          });
          this.logger.warn(`Admin email delivery failed for record ${delivery.id}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async requeueStaleDeliveries(): Promise<void> {
    await this.prisma.adminEmailCampaignDelivery.updateMany({
      where: {
        status: AdminEmailDeliveryStatus.SENDING,
        updatedAt: { lt: new Date(Date.now() - STALE_DELIVERY_MS) },
      },
      data: {
        status: AdminEmailDeliveryStatus.PENDING,
        lastError: 'A prior delivery attempt did not finish',
      },
    });
  }
}
