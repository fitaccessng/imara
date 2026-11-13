jest.mock('@nestjs/common', () => ({
  ConflictException: class ConflictException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => (target: unknown) => target,
  Logger: class Logger {},
  mixin: (target: unknown) => target,
  PayloadTooLargeException: class PayloadTooLargeException extends Error {},
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { Plan } from '@prisma/client';
import { hashToken } from '../auth/token';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { PrismaService } from '../prisma/prisma.service';
import { TempUploadInterceptor } from './temp-upload.interceptor';

describe('temporary upload plan resolution', () => {
  const interceptorType = TempUploadInterceptor() as unknown as new (
    prisma: PrismaService,
    plans: PlanCatalogueService,
  ) => { requestPlan(request: unknown): Promise<Plan | null> };

  it('uses the authenticated uploader account plan', async () => {
    const subscriptionFindUnique = jest.fn().mockResolvedValue({ plan: Plan.PRO });
    const currentPlan = jest.fn().mockResolvedValue(Plan.PRO);
    const interceptor = new interceptorType(
      { subscription: { findUnique: subscriptionFindUnique } } as never,
      { currentPlan } as never,
    );

    await expect(interceptor.requestPlan({ auth: { userId: 'uploader-id' } }))
      .resolves.toBe(Plan.PRO);
    expect(subscriptionFindUnique).toHaveBeenCalledWith({ where: { userId: 'uploader-id' } });
  });

  it("uses the event owner's plan for unauthenticated capture uploads", async () => {
    const eventFindFirst = jest.fn().mockResolvedValue({ ownerUserId: 'event-owner-id' });
    const subscriptionFindUnique = jest.fn().mockResolvedValue({ plan: Plan.FREE });
    const currentPlan = jest.fn().mockResolvedValue(Plan.FREE);
    const interceptor = new interceptorType(
      {
        event: { findFirst: eventFindFirst },
        subscription: { findUnique: subscriptionFindUnique },
      } as never,
      { currentPlan } as never,
    );

    await expect(interceptor.requestPlan({ params: { token: 'capture-token' } }))
      .resolves.toBe(Plan.FREE);
    expect(eventFindFirst).toHaveBeenCalledWith({
      where: { captureTokenHash: hashToken('capture-token'), status: 'ACTIVE' },
      select: { ownerUserId: true },
    });
    expect(subscriptionFindUnique).toHaveBeenCalledWith({ where: { userId: 'event-owner-id' } });
  });
});
