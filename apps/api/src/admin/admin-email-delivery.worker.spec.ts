jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    error = jest.fn();
    warn = jest.fn();
  },
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../auth/mailer.service', () => ({ MailerService: class MailerService {} }));

import type { MailerService } from '../auth/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AdminEmailDeliveryWorker } from './admin-email-delivery.worker';

describe('AdminEmailDeliveryWorker', () => {
  it('records a provider failure with safe diagnostic codes, never raw provider text', async () => {
    const delivery = {
      id: 'delivery-id',
      campaign: { subject: 'Update', preheader: 'A preview', html: '<p>Safe HTML</p>' },
      user: { email: 'private@example.test' },
    };
    const prisma = {
      adminEmailCampaignDelivery: {
        updateMany: jest.fn()
          .mockResolvedValueOnce({ count: 0 }) // No stale deliveries.
          .mockResolvedValueOnce({ count: 1 }), // Claim this delivery.
        findMany: jest.fn().mockResolvedValue([delivery]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const mailer = {
      isSmtpConfigured: jest.fn().mockReturnValue(true),
      sendHtmlEmail: jest.fn().mockRejectedValue(Object.assign(
        new Error('private provider details'),
        { code: 'EAUTH', responseCode: 535 },
      )),
    };
    const worker = new AdminEmailDeliveryWorker(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    await worker.processPending();

    expect(prisma.adminEmailCampaignDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, where: { status: 'PENDING' } }),
    );
    expect(mailer.sendHtmlEmail).toHaveBeenCalledWith(
      'private@example.test',
      'Update',
      '<p>Safe HTML</p>',
      'A preview',
    );
    expect(prisma.adminEmailCampaignDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-id' },
      data: { status: 'FAILED', lastError: 'SMTP send failed (SMTP 535) (EAUTH)' },
    });
    expect(JSON.stringify(prisma.adminEmailCampaignDelivery.update.mock.calls))
      .not.toContain('private provider details');
  });

  it('records SMTP acceptance using the legacy-compatible stored status', async () => {
    const prisma = {
      adminEmailCampaignDelivery: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{
          id: 'delivery-id',
          campaign: { subject: 'Update', preheader: null, html: '<p>Safe HTML</p>' },
          user: { email: 'private@example.test' },
        }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const mailer = {
      isSmtpConfigured: jest.fn().mockReturnValue(true),
      sendHtmlEmail: jest.fn().mockResolvedValue({ accepted: true }),
    };
    const worker = new AdminEmailDeliveryWorker(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    await worker.processPending();

    expect(prisma.adminEmailCampaignDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-id' },
      data: {
        status: 'SENT',
        smtpAcceptedAt: expect.any(Date),
        lastError: null,
      },
    });
  });

  it('marks a resolved SMTP response with a rejected recipient as failed', async () => {
    const prisma = {
      adminEmailCampaignDelivery: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{
          id: 'delivery-id',
          campaign: { subject: 'Update', preheader: null, html: '<p>Safe HTML</p>' },
          user: { email: 'private@example.test' },
        }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const mailer = {
      isSmtpConfigured: jest.fn().mockReturnValue(true),
      sendHtmlEmail: jest.fn().mockResolvedValue({ accepted: false, responseCode: 550 }),
    };
    const worker = new AdminEmailDeliveryWorker(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    await worker.processPending();

    expect(prisma.adminEmailCampaignDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-id' },
      data: {
        status: 'FAILED',
        lastError: 'SMTP server rejected recipient (SMTP 550)',
      },
    });
  });
});
