jest.mock('@nestjs/common', () => {
  class MockConflictException extends Error {}
  return { ConflictException: MockConflictException };
});

import { ConflictException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import {
  assertPlanCapacity,
  getPlanLimitMessage,
  serializePlanEntitlements,
} from './plan-entitlements';

describe('persisted plan entitlement serialization and capacity helpers', () => {
  const entitlements = {
    staffLimit: 4,
    activeEventLimit: 2,
    storageLimitBytes: 1234n,
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
});
