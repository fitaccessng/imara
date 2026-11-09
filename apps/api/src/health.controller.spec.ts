jest.mock('@nestjs/common', () => ({
  Controller: () => () => undefined,
  Get: () => () => undefined,
}));
jest.mock('./prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { PrismaService } from './prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports healthy only when the database responds', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(queryRaw).toHaveBeenCalled();
  });

  it('surfaces database failures to the health check', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const controller = new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(controller.check()).rejects.toThrow('database unavailable');
  });
});
