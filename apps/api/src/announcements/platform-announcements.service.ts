import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const deliveries = await this.prisma.platformAnnouncementDelivery.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        announcementId: true,
        inAppReadAt: true,
        createdAt: true,
        announcement: {
          select: { title: true, body: true, audience: true },
        },
      },
    });

    return deliveries.map(({ announcementId, inAppReadAt, createdAt, announcement }) => ({
      id: announcementId,
      ...announcement,
      readAt: inAppReadAt,
      createdAt,
    }));
  }

  async markRead(announcementId: string, userId: string) {
    const now = new Date();
    const updated = await this.prisma.platformAnnouncementDelivery.updateMany({
      where: { announcementId, userId, inAppReadAt: null },
      data: { inAppReadAt: now },
    });
    if (updated.count) return { id: announcementId, readAt: now };

    const existing = await this.prisma.platformAnnouncementDelivery.findUnique({
      where: { announcementId_userId: { announcementId, userId } },
      select: { inAppReadAt: true },
    });
    if (!existing) throw new NotFoundException('Announcement not found');
    return { id: announcementId, readAt: existing.inAppReadAt };
  }
}
