import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { ObjectStorageService } from './storage/object-storage.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  @Get()
  check() {
    return this.inspect();
  }

  @Get('ready')
  async readiness(@Res({ passthrough: true }) response: Response) {
    const health = await this.inspect();
    if (health.status === 'degraded') response.status(503);
    return health;
  }

  private async inspect() {
    const [database, objectStorage] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'healthy' as const,
        () => 'unavailable' as const,
      ),
      this.objectStorage.healthCheck(),
    ]);
    const status = database === 'healthy' && objectStorage.status === 'healthy' ? 'ok' : 'degraded';
    return { status, checks: { database, objectStorage } };
  }
}
