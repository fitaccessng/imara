jest.mock('@nestjs/common', () => ({
  Controller: () => () => undefined,
  Get: () => () => undefined,
  Res: () => () => undefined,
}));
jest.mock('./prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('./storage/object-storage.service', () => ({ ObjectStorageService: class ObjectStorageService {} }));

import { PrismaService } from './prisma/prisma.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const response = { status: jest.fn() };

  beforeEach(() => {
    response.status.mockClear();
  });

  it('reports healthy only when the database and object storage respond', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const healthCheck = jest.fn().mockResolvedValue({ status: 'healthy', driver: 's3-compatible' });
    const controller = new HealthController(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { healthCheck } as unknown as ObjectStorageService,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      checks: {
        database: 'healthy',
        objectStorage: { status: 'healthy', driver: 's3-compatible' },
      },
    });
    expect(queryRaw).toHaveBeenCalled();
    expect(healthCheck).toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns a degraded status when the database is unavailable', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const healthCheck = jest.fn().mockResolvedValue({ status: 'healthy', driver: 's3-compatible' });
    const controller = new HealthController(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { healthCheck } as unknown as ObjectStorageService,
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'degraded',
      checks: {
        database: 'unavailable',
        objectStorage: { status: 'healthy', driver: 's3-compatible' },
      },
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns an unavailable readiness status when object storage is unavailable', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const healthCheck = jest.fn().mockResolvedValue({
      status: 'not-configured',
      driver: 's3',
    });
    const controller = new HealthController(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      { healthCheck } as unknown as ObjectStorageService,
    );

    await expect(controller.readiness(response as never)).resolves.toEqual({
      status: 'degraded',
      checks: {
        database: 'healthy',
        objectStorage: { status: 'not-configured', driver: 's3' },
      },
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
