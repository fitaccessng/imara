import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WorkspaceSubscriptionLifecycle = {
  state: 'ACTIVE' | 'GRACE' | 'RESTRICTED' | 'FREE';
  plan: 'FREE' | 'PRO' | 'BUSINESS';
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  graceDaysRemaining: number;
  restricted: boolean;
};

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspaceSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getLifecycle(workspaceId: string): Promise<WorkspaceSubscriptionLifecycle> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: workspace.ownerUserId },
      select: { plan: true, currentPeriodEnd: true },
    });
    const now = new Date();

    if (!subscription || subscription.plan === Plan.FREE || !subscription.currentPeriodEnd) {
      return {
        state: 'FREE',
        plan: 'FREE',
        currentPeriodEnd: null,
        graceEndsAt: null,
        graceDaysRemaining: 0,
        restricted: false,
      };
    }

    const periodEnd = subscription.currentPeriodEnd;
    if (periodEnd > now) {
      return {
        state: 'ACTIVE',
        plan: subscription.plan,
        currentPeriodEnd: periodEnd.toISOString(),
        graceEndsAt: null,
        graceDaysRemaining: 0,
        restricted: false,
      };
    }

    const graceEnd = new Date(periodEnd.getTime() + GRACE_PERIOD_MS);
    if (graceEnd >= now) {
      const remainingMs = graceEnd.getTime() - now.getTime();
      return {
        state: 'GRACE',
        plan: subscription.plan,
        currentPeriodEnd: periodEnd.toISOString(),
        graceEndsAt: graceEnd.toISOString(),
        graceDaysRemaining: Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
        restricted: false,
      };
    }

    return {
      state: 'RESTRICTED',
      plan: subscription.plan,
      currentPeriodEnd: periodEnd.toISOString(),
      graceEndsAt: graceEnd.toISOString(),
      graceDaysRemaining: 0,
      restricted: true,
    };
  }

  async requireWriteAccess(workspaceId: string): Promise<WorkspaceSubscriptionLifecycle> {
    const lifecycle = await this.getLifecycle(workspaceId);
    if (!lifecycle.restricted) return lifecycle;
    throw new ForbiddenException({
      code: 'WORKSPACE_SUBSCRIPTION_RESTRICTED',
      message: 'This workspace is in read-only mode because its subscription is past the grace period.',
      lifecycle,
    });
  }
}
