jest.mock('@nestjs/common', () => {
  class MockConflictException extends Error {}
  class MockPayloadTooLargeException extends Error {
    constructor(private readonly response: unknown) {
      super(typeof response === 'string' ? response : (response as { message?: string }).message);
    }
    getResponse() { return this.response; }
  }
  return { ConflictException: MockConflictException, PayloadTooLargeException: MockPayloadTooLargeException };
});

import { ConflictException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import {
  assertPlanCapacity,
  assertPlanFileSize,
  getPlanMaxUploadBytes,
  getPlanLimitMessage,
  serializePlanEntitlements,
} from './plan-entitlements';

describe('persisted plan entitlement serialization and capacity helpers', () => {
  const entitlements = {
    staffLimit: 4,
    activeEventLimit: 2,
    storageLimitBytes: 1234n,
    maxUploadBytes: 1234,
    canEditDocuments: true,
    canScanDocuments: false,
    advancedTeamManagement: true,
  };

  it('serializes bigint limits for JSON responses', () => {
    expect(serializePlanEntitlements(entitlements)).toEqual({
      staffLimit: 4,
      activeEventLimit: 2,
      storageLimitBytes: '1234',
      canEditDocuments: true,
      canScanDocuments: false,
      advancedTeamManagement: true,
    });
  });

  it('allows capacity below the persisted limit and rejects the limit', () => {
    expect(() => assertPlanCapacity(Plan.PRO, 1, entitlements.activeEventLimit, 'active events'))
      .not.toThrow();
    expect(() => assertPlanCapacity(Plan.PRO, 2, entitlements.activeEventLimit, 'active events'))
      .toThrow(ConflictException);
  });

  it('keeps actionable resource messages independent of entitlement values', () => {
    expect(getPlanLimitMessage(Plan.FREE, 'active events', 3)).toContain('Upgrade to Pro at /pricing');
    expect(getPlanLimitMessage(Plan.PRO, 'staff members', 10)).toContain('Upgrade to Business at /pricing');
    expect(getPlanLimitMessage(Plan.BUSINESS, 'storage')).toContain('Contact sales at /contact');
  });

  it('sets the approved tiered file limits and returns actionable plan-specific rejection details', () => {
    expect(getPlanMaxUploadBytes(Plan.FREE)).toBe(100 * 1024 * 1024);
    expect(getPlanMaxUploadBytes(Plan.PRO)).toBe(250 * 1024 * 1024);
    expect(getPlanMaxUploadBytes(Plan.BUSINESS)).toBe(500 * 1024 * 1024);

    try {
      assertPlanFileSize(Plan.FREE, getPlanMaxUploadBytes(Plan.FREE) + 1);
      throw new Error('Expected file-size rejection');
    } catch (error) {
      expect((error as { getResponse: () => unknown }).getResponse()).toMatchObject({
        statusCode: 413,
        plan: 'free',
        maxUploadBytes: String(100 * 1024 * 1024),
        message: expect.stringContaining('Upgrade to Pro at /pricing'),
        upgradeMessage: expect.stringContaining('Upgrade to Pro at /pricing'),
      });
    }
  });
});
