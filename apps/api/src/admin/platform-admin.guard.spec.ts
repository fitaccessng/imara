jest.mock('@nestjs/common', () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  InternalServerErrorException: class InternalServerErrorException extends Error {},
  Injectable: () => (target: unknown) => target,
  UnauthorizedException: class UnauthorizedException extends Error {},
}));

import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  const makeContext = (auth?: { userId: string }) => {
    const request: Record<string, unknown> = { auth };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  it('checks the current database role and places the authorized profile on the request', async () => {
    const admin = {
      id: 'admin-id',
      email: 'admin@example.test',
      name: 'Admin',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
      platformAdminProfile: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(admin) } };
    const guard = new PlatformAdminGuard(prisma as unknown as PrismaService);
    const { context, request } = makeContext({ userId: admin.id });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: admin.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        platformAdminProfile: { select: { role: true, status: true } },
      },
    });
    expect(request.platformAdmin).toEqual(admin);
  });

  it('denies a user whose current database role is not ADMIN', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'USER',
          platformAdminProfile: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as unknown as PrismaService);
    const { context } = makeContext({ userId: 'user-id' });

    await expect(guard.canActivate(context)).rejects.toThrow('Platform administrator access required');
  });

  it.each([
    ['missing profile', null],
    ['suspended profile', { role: 'SUPER_ADMIN', status: 'SUSPENDED' }],
  ])('denies an admin with %s', async (_label, profile) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-id',
          role: 'ADMIN',
          platformAdminProfile: profile,
        }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as unknown as PrismaService);
    const { context } = makeContext({ userId: 'admin-id' });

    await expect(guard.canActivate(context)).rejects.toThrow('Platform administrator access required');
  });

  it('denies a deleted user and fails closed when there is no authenticated session identity', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const guard = new PlatformAdminGuard(prisma as unknown as PrismaService);
    const { context: noIdentity } = makeContext();
    await expect(guard.canActivate(noIdentity)).rejects.toThrow('Authentication required');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    const { context } = makeContext({ userId: 'deleted-user-id' });
    await expect(guard.canActivate(context)).rejects.toThrow('Platform administrator access required');
  });
});
