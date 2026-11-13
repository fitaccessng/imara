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
  it('claims a bounded batch, sends sanitized queued messages and records provider failures generically', async () => {
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
      sendHtmlEmail: jest.fn().mockRejectedValue(new Error('private provider details')),
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
      data: { status: 'FAILED', lastError: 'Email delivery failed' },
    });
    expect(JSON.stringify(prisma.adminEmailCampaignDelivery.update.mock.calls))
      .not.toContain('private provider details');
  });
});
