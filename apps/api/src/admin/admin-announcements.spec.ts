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
        metadata: { audience: 'PRO', recipientCount: 2, emailEnabled: true },
      }),
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
      emailEnabled: true,
    }, request())).rejects.toThrow('Configure SMTP email delivery');
  });
});
