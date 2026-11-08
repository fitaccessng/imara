jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
  UnauthorizedException: class UnauthorizedException extends Error {},
}));

import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './token';
import { SessionGuard } from './session.guard';

describe('SessionGuard activity tracking', () => {
  const plans = { currentPlan: jest.fn(async () => 'FREE') };
  const token = 'session-token-with-at-least-thirty-two-characters';
  const request = { cookies: { imara_session: token } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  it('does not write session activity for every authenticated request', async () => {
    const session = {
      id: 'session-id',
      userId: 'user-id',
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      user: { accountStatus: 'ACTIVE' },
    };
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn(),
      },
    };
    const guard = new SessionGuard(prisma as unknown as PrismaService, plans as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.session.updateMany).not.toHaveBeenCalled();
    expect(request).toHaveProperty('auth', {
      userId: 'user-id',
      sessionId: 'session-id',
      tokenHash: hashToken(token),
    });
  });

  it('updates activity after the session has been idle for five minutes', async () => {
    const session = {
      id: 'session-id',
      userId: 'user-id',
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(Date.now() - 6 * 60_000),
      user: { accountStatus: 'ACTIVE' },
    };
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const guard = new SessionGuard(prisma as unknown as PrismaService, plans as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: session.id, tokenHash: hashToken(token) }),
      data: { lastSeenAt: expect.any(Date) },
    }));
  });

  it('rejects a still-unrevoked session when its account is suspended', async () => {
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-id',
          userId: 'user-id',
          tokenHash: hashToken(token),
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          lastSeenAt: new Date(),
          user: { accountStatus: 'SUSPENDED' },
        }),
        updateMany: jest.fn(),
      },
    };
    const guard = new SessionGuard(prisma as unknown as PrismaService, plans as never);

    await expect(guard.canActivate(context)).rejects.toThrow('Session is invalid or expired');
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('expires paid access and applies the Free storage allowance', async () => {
    const currentPeriodEnd = new Date(Date.now() - 60_000);
    const session = {
      id: 'session-id',
      userId: 'user-id',
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      user: {
        accountStatus: 'ACTIVE',
        subscription: { id: 'subscription-id', plan: 'PRO', currentPeriodEnd },
      },
    };
    const subscriptionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const workspaceUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      subscription: { updateMany: subscriptionUpdate },
      workspace: { updateMany: workspaceUpdate },
    }));
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session), updateMany: jest.fn() },
      $transaction: transaction,
    };
    plans.currentPlan.mockResolvedValue('FREE');
    const guard = new SessionGuard(prisma as unknown as PrismaService, plans as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(plans.currentPlan).toHaveBeenCalledWith(
      { ...session.user.subscription, userId: 'user-id' },
      expect.any(Object),
    );
  });
});
