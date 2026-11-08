jest.mock('@nestjs/common', () => {
  class MockForbiddenException extends Error {}
  class MockServiceUnavailableException extends Error {}
  return {
    ForbiddenException: MockForbiddenException,
    Injectable: () => (target: unknown) => target,
    ServiceUnavailableException: MockServiceUnavailableException,
  };
});
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from './plan-catalogue.service';

const configs = {
  FREE: {
    plan: Plan.FREE,
    staffLimit: 3,
    activeEventLimit: 3,
    storageLimitBytes: 5_000n,
    canEditDocuments: false,
    canScanDocuments: false,
    advancedTeamManagement: false,
    monthlyPriceMinor: 0n,
    currency: 'NGN',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  PRO: {
    plan: Plan.PRO,
    staffLimit: 8,
    activeEventLimit: 6,
    storageLimitBytes: 15_000n,
    canEditDocuments: true,
    canScanDocuments: true,
    advancedTeamManagement: false,
    monthlyPriceMinor: 300_000n,
    currency: 'NGN',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  BUSINESS: {
    plan: Plan.BUSINESS,
    staffLimit: 30,
    activeEventLimit: 20,
    storageLimitBytes: 25_000n,
    canEditDocuments: true,
    canScanDocuments: true,
    advancedTeamManagement: true,
    monthlyPriceMinor: 1_000_000n,
    currency: 'NGN',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
};

describe('PlanCatalogueService', () => {
  it('reads feature flags, limits, and prices from persisted config', async () => {
    const findUnique = jest.fn().mockResolvedValue(configs.PRO);
    const service = new PlanCatalogueService({
      planCatalogue: { findUnique },
    } as unknown as PrismaService);

    await expect(service.getEntitlements(Plan.PRO)).resolves.toEqual({
      staffLimit: 8,
      activeEventLimit: 6,
      storageLimitBytes: 15_000n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { plan: Plan.PRO } });
  });

  it('uses transaction-scoped catalog data and enforces persisted feature flags', async () => {
    const freeConfig = { ...configs.FREE, canScanDocuments: true };
    const transactionCatalogue = {
      planCatalogue: { findUnique: jest.fn().mockResolvedValue(freeConfig) },
    };
    const service = new PlanCatalogueService({} as PrismaService);

    await expect(service.requireFeature(
      Plan.FREE,
      'canScanDocuments',
      transactionCatalogue as never,
    )).resolves.toBeUndefined();
    await expect(service.requireFeature(
      Plan.FREE,
      'canEditDocuments',
      transactionCatalogue as never,
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(transactionCatalogue.planCatalogue.findUnique).toHaveBeenCalledTimes(2);
  });

  it('enforces the persisted advanced-team-management entitlement', async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce(configs.PRO)
      .mockResolvedValueOnce(configs.BUSINESS);
    const service = new PlanCatalogueService({
      planCatalogue: { findUnique },
    } as unknown as PrismaService);

    await expect(service.requireAdvancedTeamManagement(Plan.PRO))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requireAdvancedTeamManagement(Plan.BUSINESS))
      .resolves.toBeUndefined();
  });

  it('serializes public pricing with exact minor-unit price, entitlements, and no admin internals', async () => {
    const service = new PlanCatalogueService({
      planCatalogue: {
        findMany: jest.fn().mockResolvedValue([
          configs.BUSINESS,
          configs.FREE,
          configs.PRO,
        ]),
      },
    } as unknown as PrismaService);

    const result = await service.publicCatalogue();

    expect(result).toEqual({
      plans: [
        {
          plan: 'FREE',
          name: 'Free',
          currency: 'NGN',
          monthlyPriceMinor: '0',
          limits: { staffLimit: 3, activeEventLimit: 3, storageLimitBytes: '5000' },
          features: {
            canEditDocuments: false,
            canScanDocuments: false,
            advancedTeamManagement: false,
          },
        },
        {
          plan: 'PRO',
          name: 'Pro',
          currency: 'NGN',
          monthlyPriceMinor: '300000',
          limits: { staffLimit: 8, activeEventLimit: 6, storageLimitBytes: '15000' },
          features: {
            canEditDocuments: true,
            canScanDocuments: true,
            advancedTeamManagement: false,
          },
        },
        {
          plan: 'BUSINESS',
          name: 'Business',
          currency: 'NGN',
          monthlyPriceMinor: '1000000',
          limits: { staffLimit: 30, activeEventLimit: 20, storageLimitBytes: '25000' },
          features: {
            canEditDocuments: true,
            canScanDocuments: true,
            advancedTeamManagement: true,
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('updatedAt');
    expect(JSON.stringify(result)).not.toContain('trial');
  });

  it('fails closed if a migrated catalogue record is missing', async () => {
    const service = new PlanCatalogueService({
      planCatalogue: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);
    await expect(service.getEntitlements(Plan.FREE))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
