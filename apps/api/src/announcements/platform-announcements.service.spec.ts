jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  NotFoundException: class NotFoundException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../prisma/prisma.service';
import { PlatformAnnouncementsService } from './platform-announcements.service';

describe('PlatformAnnouncementsService', () => {
  it('lists only the signed-in user’s deliveries and marks their announcement read', async () => {
    const delivery = {
      announcementId: 'announcement-id',
      inAppReadAt: null,
      createdAt: new Date('2026-11-08T00:00:00Z'),
      announcement: { title: 'Update', body: 'A release is ready', audience: 'ALL' },
    };
    const prisma = {
      platformAnnouncementDelivery: {
        findMany: jest.fn().mockResolvedValue([delivery]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new PlatformAnnouncementsService(prisma as unknown as PrismaService);

    await expect(service.listForUser('user-id')).resolves.toEqual([{
      id: 'announcement-id',
      title: 'Update',
      body: 'A release is ready',
      audience: 'ALL',
      readAt: null,
      createdAt: delivery.createdAt,
    }]);
    expect(prisma.platformAnnouncementDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-id' },
    }));

    await expect(service.markRead('announcement-id', 'user-id')).resolves.toMatchObject({
      id: 'announcement-id',
      readAt: expect.any(Date),
    });
    expect(prisma.platformAnnouncementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId: 'announcement-id', userId: 'user-id', inAppReadAt: null },
    }));
  });
});
