import { ConflictException } from '@nestjs/common';
import { Plan } from '@prisma/client';

export interface PlanEntitlements {
  staffLimit: number;
  activeEventLimit: number;
  storageLimitBytes: bigint;
  canEditDocuments: boolean;
  canScanDocuments: boolean;
  advancedTeamManagement: boolean;
}

export function getPlanLimitMessage(plan: Plan, resource: string, limit?: number): string {
  const action = plan === Plan.FREE
    ? 'Upgrade to Pro at /pricing'
    : plan === Plan.PRO
      ? 'Upgrade to Business at /pricing'
      : 'Contact sales at /contact';
  if (resource === 'storage') return `Storage limit reached. Free up space or ${action}.`;
  return `Your ${plan.toLowerCase()} plan supports up to ${limit} ${resource}. ${action} to increase the limit.`;
}

export function assertPlanCapacity(plan: Plan, current: number, limit: number, resource: string): void {
  if (current < limit) return;
  throw new ConflictException(getPlanLimitMessage(plan, resource, limit));
}

export function serializePlanEntitlements(entitlements: PlanEntitlements) {
  return {
    staffLimit: entitlements.staffLimit,
    activeEventLimit: entitlements.activeEventLimit,
    storageLimitBytes: entitlements.storageLimitBytes.toString(),
    canEditDocuments: entitlements.canEditDocuments,
    canScanDocuments: entitlements.canScanDocuments,
    advancedTeamManagement: entitlements.advancedTeamManagement,
  };
}

export function serializePlanCatalogue(
  catalogue: {
    plan: Plan;
    staffLimit: number;
    activeEventLimit: number;
    storageLimitBytes: bigint;
    canEditDocuments: boolean;
    canScanDocuments: boolean;
    advancedTeamManagement: boolean;
    monthlyPriceMinor: bigint;
    currency: string;
    updatedAt: Date;
  },
  includeUpdatedAt = false,
) {
  const name = catalogue.plan === Plan.FREE
    ? 'Free'
    : catalogue.plan === Plan.PRO
      ? 'Pro'
      : 'Business';
  return {
    plan: catalogue.plan,
    name,
    currency: catalogue.currency,
    monthlyPriceMinor: catalogue.monthlyPriceMinor.toString(),
    limits: {
      staffLimit: catalogue.staffLimit,
      activeEventLimit: catalogue.activeEventLimit,
      storageLimitBytes: catalogue.storageLimitBytes.toString(),
    },
    features: {
      canEditDocuments: catalogue.canEditDocuments,
      canScanDocuments: catalogue.canScanDocuments,
      advancedTeamManagement: catalogue.advancedTeamManagement,
    },
    ...(includeUpdatedAt ? { updatedAt: catalogue.updatedAt } : {}),
  };
}
