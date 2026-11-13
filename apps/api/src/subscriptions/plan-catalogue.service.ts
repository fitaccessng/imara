import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Plan, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPlanMaxUploadBytes,
  PlanEntitlements,
  serializePlanCatalogue,
} from './plan-entitlements';

type CatalogueClient = Pick<Prisma.TransactionClient, 'planCatalogue' | 'subscription' | 'workspace'>;
const PLAN_ORDER = [Plan.FREE, Plan.PRO, Plan.BUSINESS] as const;

@Injectable()
export class PlanCatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlan(plan: Plan, client: CatalogueClient = this.prisma) {
    const catalogue = await client.planCatalogue.findUnique({ where: { plan } });
    if (!catalogue) {
      throw new ServiceUnavailableException('Plan catalogue is unavailable');
    }
    return catalogue;
  }

  async getEntitlements(
    plan: Plan,
    client: CatalogueClient = this.prisma,
  ): Promise<PlanEntitlements> {
    const catalogue = await this.getPlan(plan, client);
    return {
      staffLimit: catalogue.staffLimit,
      activeEventLimit: catalogue.activeEventLimit,
      storageLimitBytes: catalogue.storageLimitBytes,
      maxUploadBytes: getPlanMaxUploadBytes(plan),
      canEditDocuments: catalogue.canEditDocuments,
      canScanDocuments: catalogue.canScanDocuments,
      advancedTeamManagement: catalogue.advancedTeamManagement,
    };
  }

  async currentPlan(
    subscription: {
      id: string;
      userId: string;
      plan: Plan;
      currentPeriodEnd: Date | null;
    },
    client: CatalogueClient = this.prisma,
  ): Promise<Plan> {
    const now = new Date();
    if (subscription.plan === Plan.FREE || !subscription.currentPeriodEnd || subscription.currentPeriodEnd > now) {
      return subscription.plan;
    }

    const freePlan = await this.getPlan(Plan.FREE, client);
    const expired = await client.subscription.updateMany({
      where: {
        id: subscription.id,
        plan: subscription.plan,
        currentPeriodEnd: { lte: now },
      },
      data: {
        plan: Plan.FREE,
        storageLimitBytes: freePlan.storageLimitBytes,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
    });
    if (expired.count) {
      await client.workspace.updateMany({
        where: { ownerUserId: subscription.userId },
        data: { storageLimitBytes: freePlan.storageLimitBytes },
      });
      return Plan.FREE;
    }

    const latest = await client.subscription.findUnique({
      where: { userId: subscription.userId },
      select: { plan: true },
    });
    return latest?.plan ?? Plan.FREE;
  }

  async requireFeature(
    plan: Plan,
    feature: 'canEditDocuments' | 'canScanDocuments',
    client: CatalogueClient = this.prisma,
  ): Promise<void> {
    const entitlements = await this.getEntitlements(plan, client);
    if (entitlements[feature]) return;

    const featureName = feature === 'canEditDocuments' ? 'Document editing' : 'Scan-to-upload';
    throw new ForbiddenException(
      `${featureName} is not included in the ${plan.toLowerCase()} plan.`,
    );
  }

  async requireAdvancedTeamManagement(
    plan: Plan,
    client: CatalogueClient = this.prisma,
  ): Promise<void> {
    const entitlements = await this.getEntitlements(plan, client);
    if (entitlements.advancedTeamManagement) return;
    throw new ForbiddenException(
      `Advanced team management is not included in the ${plan.toLowerCase()} plan.`,
    );
  }

  async publicCatalogue() {
    const records = await this.prisma.planCatalogue.findMany();
    const byPlan = new Map(records.map((record) => [record.plan, record]));
    const plans = PLAN_ORDER.map((plan) => {
      const record = byPlan.get(plan);
      if (!record) throw new ServiceUnavailableException('Plan catalogue is unavailable');
      return serializePlanCatalogue(record);
    });
    return { plans };
  }
}
