jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
}));

import { InsightsService } from './insights.service';

describe('InsightsService', () => {
  const storedFileCount = jest.fn();
  const storedFileFindMany = jest.fn();
  const fileRequestCount = jest.fn();
  const prisma = {
    storedFile: { count: storedFileCount, findMany: storedFileFindMany },
    fileRequest: { count: fileRequestCount },
  };
  const service = new InsightsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T19:00:00.000Z'));
    storedFileCount.mockResolvedValue(4);
    storedFileFindMany.mockResolvedValue([
      { id: 'file-1', originalName: 'Passport.pdf', expiryDate: new Date('2026-12-01T00:00:00.000Z') },
    ]);
    fileRequestCount.mockResolvedValue(2);
  });

  afterEach(() => jest.useRealTimers());

  it('counts personal files created in the rolling 7-day window and active owned requests', async () => {
    await expect(service.weekly('user-a')).resolves.toEqual({
      period: {
        startsAt: new Date('2026-11-06T19:00:00.000Z'),
        endsAt: new Date('2026-11-13T19:00:00.000Z'),
        durationDays: 7,
      },
      filesCreated: 4,
      activeFileRequests: 2,
      upcomingExpiry: {
        supported: true,
        items: [{
          id: 'file-1',
          name: 'Passport.pdf',
          expiresAt: '2026-12-01',
        }],
      },
    });
    expect(storedFileCount).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        workspaceId: null,
        eventId: null,
        status: 'READY',
        deletedAt: null,
        createdAt: {
          gte: new Date('2026-11-06T19:00:00.000Z'),
          lte: new Date('2026-11-13T19:00:00.000Z'),
        },
      },
    });
    expect(fileRequestCount).toHaveBeenCalledWith({
      where: { creatorUserId: 'user-a', revokedAt: null },
    });
    expect(storedFileFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        workspaceId: null,
        eventId: null,
        fileRequestId: null,
        status: 'READY',
        deletedAt: null,
        expiryDate: {
          gte: new Date('2026-11-13T00:00:00.000Z'),
          lte: new Date('2026-12-13T00:00:00.000Z'),
        },
      },
      select: { id: true, originalName: true, expiryDate: true },
      orderBy: { expiryDate: 'asc' },
    });
  });
});
