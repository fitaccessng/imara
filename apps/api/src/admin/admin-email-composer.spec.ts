import 'reflect-metadata';

jest.mock('@nestjs/common', () => ({
  BadRequestException: class BadRequestException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => (target: unknown) => target,
  InternalServerErrorException: class InternalServerErrorException extends Error {},
  NotFoundException: class NotFoundException extends Error {},
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../auth/mailer.service', () => ({ MailerService: class MailerService {} }));

import type { MailerService } from '../auth/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PlatformAdminRequest } from './platform-admin.types';
import { AdminEmailRecipientFilter } from './admin.dto';
import { AdminService } from './admin.service';

function request(): PlatformAdminRequest {
  return {
    ip: '192.0.2.2',
    get: jest.fn().mockReturnValue('Test Agent'),
    platformAdmin: { id: 'admin-id' },
  } as unknown as PlatformAdminRequest;
}

describe('AdminService email composer', () => {
  it('lists minimal active user fields and applies the verification filter', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{
          id: 'user-id',
          name: 'Customer',
          email: 'customer@example.test',
          emailVerifiedAt: new Date('2026-11-10T00:00:00Z'),
        }]),
      },
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.emailComposerRecipients({
      page: 1,
      pageSize: 25,
      filter: AdminEmailRecipientFilter.VERIFIED,
    }, request())).resolves.toMatchObject({
      items: [{
        id: 'user-id',
        name: 'Customer',
        email: 'customer@example.test',
        emailVerified: true,
      }],
      page: { totalItems: 1 },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        role: 'USER',
        accountStatus: 'ACTIVE',
        emailVerifiedAt: { not: null },
      }),
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    }));
  });

  it('sanitizes HTML and queues selected recipients without sending inline', async () => {
    const recipients = [
      { id: 'user-1', email: 'one@example.test' },
      { id: 'user-2', email: 'two@example.test' },
    ];
    const tx = {
      adminEmailCampaign: {
        create: jest.fn().mockResolvedValue({
          id: 'campaign-id',
          subject: 'Product update',
          createdAt: new Date('2026-11-12T00:00:00Z'),
        }),
      },
      adminEmailCampaignDelivery: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(recipients) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const mailer = {
      isSmtpConfigured: jest.fn().mockReturnValue(true),
      sendHtmlEmail: jest.fn(),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    const result = await service.sendComposedEmail({
      recipientIds: recipients.map(({ id }) => id),
      subject: 'Product update',
      html: '<p style="color:#17364b;font-size:16px;background-image:url(javascript:alert(1))">Hello <strong>there</strong></p><script>alert(1)</script><a href="javascript:alert(2)">click</a>',
    }, request());

    expect(result).toEqual({
      campaignId: 'campaign-id',
      subject: 'Product update',
      createdAt: new Date('2026-11-12T00:00:00Z'),
      status: 'QUEUED',
      recipientCount: 2,
      queuedCount: 2,
      queuedRecipientCount: 2,
    });
    expect(mailer.sendHtmlEmail).not.toHaveBeenCalled();
    const storedHtml = tx.adminEmailCampaign.create.mock.calls[0][0].data.html;
    expect(storedHtml).toContain('<strong>there</strong>');
    expect(storedHtml).toContain('color:#17364b');
    expect(storedHtml).not.toContain('background-image');
    expect(storedHtml).not.toContain('<script>');
    expect(storedHtml).not.toContain('javascript:');
    expect(JSON.stringify(result)).not.toContain('example.test');
    expect(tx.adminEmailCampaignDelivery.createMany).toHaveBeenCalledWith({
      data: [
        { campaignId: 'campaign-id', userId: 'user-1', status: 'PENDING' },
        { campaignId: 'campaign-id', userId: 'user-2', status: 'PENDING' },
      ],
    });
    expect(tx.platformAdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.email-composer.send',
        metadata: expect.objectContaining({ recipientMode: 'selected', recipientCount: 2 }),
      }),
    }));
  });

  it('reports queued, sent, and failed delivery counts without recipient data', async () => {
    const prisma = {
      adminEmailCampaign: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'campaign-id',
          subject: 'Update',
          createdAt: new Date('2026-11-12T00:00:00Z'),
          _count: { deliveries: 4 },
        }),
      },
      adminEmailCampaignDelivery: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'SENT', _count: { _all: 2 } },
          { status: 'FAILED', _count: { _all: 1 } },
          { status: 'PENDING', _count: { _all: 1 } },
        ]),
      },
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.emailComposerCampaignStatus('campaign-id', request())).resolves.toMatchObject({
      campaignId: 'campaign-id',
      status: 'QUEUED',
      recipientCount: 4,
      pendingCount: 1,
      sendingCount: 0,
      sentCount: 2,
      failedCount: 1,
      errors: [{
        count: 1,
        message: 'Email delivery failed for these recipients; identities are omitted.',
      }],
    });
  });

  it('queues the existing plan-audience targeting shape', async () => {
      const tx = {
        adminEmailCampaign: {
          create: jest.fn().mockResolvedValue({
            id: 'campaign-id',
            subject: 'Update',
            createdAt: new Date('2026-11-12T00:00:00Z'),
          }),
        },
        adminEmailCampaignDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
      };
      const prisma = {
        user: { findMany: jest.fn().mockResolvedValue([{ id: 'pro-user', email: 'pro@example.test' }]) },
        $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
      };
      const service = new AdminService(
        prisma as unknown as PrismaService,
        { isSmtpConfigured: jest.fn().mockReturnValue(true) } as unknown as MailerService,
      );

      await expect(service.sendComposedEmail({
        target: 'AUDIENCE' as never,
        audience: 'PRO' as never,
        filter: 'VERIFIED' as never,
        subject: 'Update',
        preheader: 'A quick preview',
        html: '<p>Update</p>',
      }, request())).resolves.toMatchObject({
        status: 'QUEUED',
        queuedRecipientCount: 1,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          role: 'USER',
          accountStatus: 'ACTIVE',
          subscription: { is: { plan: 'PRO' } },
          emailVerifiedAt: { not: null },
        }),
        take: 501,
      }));
      expect(tx.adminEmailCampaign.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ preheader: 'A quick preview' }),
      }));
  });

  it('rejects filtered audiences above the hard send limit', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 501 }, (_, index) => ({ id: `user-${index}`, email: `${index}@example.test` })),
        ),
      },
    };
    const mailer = {
      isSmtpConfigured: jest.fn().mockReturnValue(true),
      sendHtmlEmail: jest.fn(),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    await expect(service.sendComposedEmail({
      filter: AdminEmailRecipientFilter.ALL,
      subject: 'Update',
      html: '<p>Update</p>',
    }, request())).rejects.toThrow('500-recipient limit');
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }));
    expect(mailer.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('rejects unavailable selected users and requests without exactly one target', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'active-id', email: 'a@example.test' }]) } };
    const mailer = { isSmtpConfigured: jest.fn().mockReturnValue(true), sendHtmlEmail: jest.fn() };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      mailer as unknown as MailerService,
    );

    await expect(service.sendComposedEmail({
      recipientIds: ['active-id', 'inactive-id'],
      subject: 'Update',
      html: '<p>Update</p>',
    }, request())).rejects.toThrow('unavailable');
    await expect(service.sendComposedEmail({
      subject: 'Update',
      html: '<p>Update</p>',
    }, request())).rejects.toThrow('either recipientIds or an audience filter');
    expect(mailer.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('fails explicitly when SMTP is unavailable', async () => {
    const service = new AdminService({} as PrismaService, {
      isSmtpConfigured: jest.fn().mockReturnValue(false),
    } as unknown as MailerService);

    await expect(service.sendComposedEmail({
      filter: AdminEmailRecipientFilter.ALL,
      subject: 'Update',
      html: '<p>Update</p>',
    }, request())).rejects.toThrow('SMTP email delivery is not configured');
  });
});
