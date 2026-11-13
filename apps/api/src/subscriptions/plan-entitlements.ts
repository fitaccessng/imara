import { ConflictException, PayloadTooLargeException } from '@nestjs/common';
import { Plan } from '@prisma/client';

export const PLAN_MAX_UPLOAD_BYTES: Record<Plan, number> = {
  [Plan.FREE]: 100 * 1024 * 1024,
  [Plan.PRO]: 250 * 1024 * 1024,
  [Plan.BUSINESS]: 500 * 1024 * 1024,
};

const PLAN_NAMES: Record<Plan, string> = {
  [Plan.FREE]: 'Free',
  [Plan.PRO]: 'Pro',
  [Plan.BUSINESS]: 'Business',
};

function formatMiB(bytes: number): string {
  return `${bytes / (1024 * 1024)} MiB`;
}

export function getPlanMaxUploadBytes(plan: Plan): number {
  return PLAN_MAX_UPLOAD_BYTES[plan];
}

export function getPlanUploadUpgradeMessage(plan: Plan): string {
  if (plan === Plan.FREE) return 'Upgrade to Pro at /pricing to upload files up to 250 MiB.';
  if (plan === Plan.PRO) return 'Upgrade to Business at /pricing to upload files up to 500 MiB.';
  return 'Contact sales at /contact for higher upload limits.';
}

export function getPlanFileSizeException(plan: Plan): PayloadTooLargeException {
  const maxBytes = getPlanMaxUploadBytes(plan);
  const upgradeMessage = getPlanUploadUpgradeMessage(plan);
  return new PayloadTooLargeException({
    statusCode: 413,
    error: 'Payload Too Large',
    message: `This file exceeds the ${PLAN_NAMES[plan]} plan per-file limit of ${formatMiB(maxBytes)}. ${upgradeMessage}`,
    plan: plan.toLowerCase(),
    maxUploadBytes: maxBytes.toString(),
    upgradeMessage,
  });
}

export function assertPlanFileSize(plan: Plan, sizeBytes: number): void {
  if (sizeBytes <= getPlanMaxUploadBytes(plan)) return;
  throw getPlanFileSizeException(plan);
}

export interface PlanEntitlements {
  staffLimit: number;
  activeEventLimit: number;
  storageLimitBytes: bigint;
  maxUploadBytes: number;
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
      maxUploadBytes: getPlanMaxUploadBytes(catalogue.plan).toString(),
    },
    features: {
      canEditDocuments: catalogue.canEditDocuments,
      canScanDocuments: catalogue.canScanDocuments,
      advancedTeamManagement: catalogue.advancedTeamManagement,
    },
    ...(includeUpdatedAt ? { updatedAt: catalogue.updatedAt } : {}),
  };
}
