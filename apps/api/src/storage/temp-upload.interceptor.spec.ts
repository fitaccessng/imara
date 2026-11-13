jest.mock('@nestjs/common', () => ({
  ConflictException: class ConflictException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => (target: unknown) => target,
  Logger: class Logger {},
  mixin: (target: unknown) => target,
  NotFoundException: class NotFoundException extends Error {},
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

  it("uses the file request creator's plan and rejects invalid requests before parsing", async () => {
    const token = 'r'.repeat(43);
    const fileRequestFindFirst = jest.fn().mockResolvedValue({ creatorUserId: 'owner-id' });
    const subscriptionFindUnique = jest.fn().mockResolvedValue({ plan: Plan.BUSINESS });
    const currentPlan = jest.fn().mockResolvedValue(Plan.BUSINESS);
    const interceptor = new interceptorType(
      { fileRequest: { findFirst: fileRequestFindFirst }, subscription: { findUnique: subscriptionFindUnique } } as never,
      { currentPlan } as never,
    );

    await expect(interceptor.requestPlan({ params: { fileRequestToken: token } }))
      .resolves.toBe(Plan.BUSINESS);
    expect(fileRequestFindFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null,
        creator: { accountStatus: 'ACTIVE' },
      },
      select: { creatorUserId: true },
    });

    await expect(interceptor.requestPlan({ params: { fileRequestToken: 'invalid' } }))
      .rejects.toThrow('File request not found');
  });
});
