import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRY_WINDOW_DAYS = 30;
const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async weekly(userId: string) {
    const endsAt = new Date();
    const startsAt = new Date(endsAt.getTime() - WEEK_MS);
    const expiryStartsAt = new Date(Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate()));
    const expiryEndsAt = new Date(expiryStartsAt.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [filesCreated, activeFileRequests, expiringFiles] = await Promise.all([
      this.prisma.storedFile.count({
        where: {
          userId,
          workspaceId: null,
          eventId: null,
          status: 'READY',
          deletedAt: null,
          createdAt: { gte: startsAt, lte: endsAt },
        },
      }),
      this.prisma.fileRequest.count({
        where: { creatorUserId: userId, revokedAt: null },
      }),
      this.prisma.storedFile.findMany({
        where: {
          userId,
          workspaceId: null,
          eventId: null,
          fileRequestId: null,
          status: 'READY',
          deletedAt: null,
          expiryDate: { gte: expiryStartsAt, lte: expiryEndsAt },
        },
        select: { id: true, originalName: true, expiryDate: true },
        orderBy: { expiryDate: 'asc' },
      }),
    ]);

    return {
      period: { startsAt, endsAt, durationDays: 7 },
      filesCreated,
      activeFileRequests,
      upcomingExpiry: {
        supported: true,
        items: expiringFiles.map((file) => ({
          id: file.id,
          name: file.originalName,
          expiresAt: toDateOnly(file.expiryDate!),
        })),
      },
    };
  }
}
