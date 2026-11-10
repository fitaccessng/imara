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
import { AdminService } from './admin.service';

function request(): PlatformAdminRequest {
  return {
    ip: '192.0.2.2',
    get: jest.fn().mockReturnValue('Test Agent'),
    platformAdmin: { id: 'admin-id' },
  } as unknown as PlatformAdminRequest;
}

describe('AdminService announcements', () => {
  it('creates in-app and queued email deliveries for active users in the selected plan', async () => {
    const tx = {
      platformAnnouncement: {
        create: jest.fn().mockResolvedValue({
          id: 'announcement-id',
          title: 'Update',
          audience: 'PRO',
              target: 'AUDIENCE',
              signupWindowMinutes: null,
              emailEnabled: true,
          createdAt: new Date('2026-11-08T00:00:00Z'),
        }),
      },
      platformAnnouncementDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      platformAdminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-id' }),
      },
    };
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const mailer = { isSmtpConfigured: jest.fn().mockReturnValue(true) };
    const service = new AdminService(prisma as unknown as PrismaService, mailer as unknown as MailerService);

    await expect(service.createAnnouncement({
      title: 'Update',
      body: 'A new feature is available',
      audience: 'PRO' as never,
      target: 'AUDIENCE' as never,
      emailEnabled: true,
    }, request())).resolves.toMatchObject({
      id: 'announcement-id',
      recipientCount: 2,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        role: 'USER',
        accountStatus: 'ACTIVE',
        subscription: { is: { plan: 'PRO' } },
      },
      select: { id: true },
    });
    expect(tx.platformAnnouncementDelivery.createMany).toHaveBeenCalledWith({
      data: [
        { announcementId: 'announcement-id', userId: 'user-1', emailStatus: 'PENDING' },
        { announcementId: 'announcement-id', userId: 'user-2', emailStatus: 'PENDING' },
      ],
    });
    expect(tx.platformAdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.announcement.create',
        resourceId: 'announcement-id',
        metadata: expect.objectContaining({
          audience: 'PRO',
          target: 'AUDIENCE',
          signupWindowMinutes: null,
          recipientCount: 2,
          emailEnabled: true,
        }),
      }),
    }));
  });

  it('targets active accounts created within the selected signup window', async () => {
    const tx = {
      platformAnnouncement: { create: jest.fn().mockResolvedValue({ id: 'announcement-id' }) },
      platformAnnouncementDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'recent-user' }]) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const service = new AdminService(prisma as unknown as PrismaService);
    const beforeSend = Date.now();

    await expect(service.createAnnouncement({
      title: 'Welcome',
      body: 'Thanks for joining',
      audience: 'ALL' as never,
      target: 'SIGNUP_WINDOW' as never,
      signupWindowMinutes: 30,
      emailEnabled: false,
    }, request())).resolves.toMatchObject({ recipientCount: 1 });

    const query = prisma.user.findMany.mock.calls[0][0] as { where: { createdAt: { gte: Date } } };
    expect(query.where).toMatchObject({
      role: 'USER',
      accountStatus: 'ACTIVE',
    });
    expect(query.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(beforeSend - 30 * 60_000);
    expect(query.where.createdAt.gte.getTime()).toBeLessThanOrEqual(Date.now() - 30 * 60_000);
  });

  it('rejects selected users that are not active customers', async () => {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'active-user' }]) },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.createAnnouncement({
      title: 'Targeted',
      body: 'Message',
      audience: 'ALL' as never,
      target: 'SELECTED' as never,
      userIds: ['active-user', 'unavailable-user'],
      emailEnabled: false,
    }, request())).rejects.toThrow('inactive or unavailable');
  });

  it('searches only active customer accounts for individual targeting', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{
          id: 'user-id',
          name: 'Customer',
          email: 'customer@example.test',
          createdAt: new Date('2026-11-10T00:00:00Z'),
        }]),
      },
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    await expect(service.announcementRecipients({
      page: 1,
      pageSize: 20,
      q: 'customer',
    }, request())).resolves.toMatchObject({
      items: [{ id: 'user-id', email: 'customer@example.test' }],
      page: { totalItems: 1 },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: 'USER', accountStatus: 'ACTIVE' }),
      select: { id: true, name: true, email: true, createdAt: true },
    }));
  });

  it('rejects email announcements when SMTP is not configured', async () => {
    const service = new AdminService({} as PrismaService, {
      isSmtpConfigured: jest.fn().mockReturnValue(false),
    } as unknown as MailerService);

    await expect(service.createAnnouncement({
      title: 'Update',
      body: 'Body',
      audience: 'ALL' as never,
      target: 'AUDIENCE' as never,
      emailEnabled: true,
    }, request())).rejects.toThrow('Configure SMTP email delivery');
  });
});
