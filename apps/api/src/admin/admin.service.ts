import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  EventGallerySetting,
  EventStatus,
  PaymentAttemptStatus,
  PlatformAnnouncementAudience,
  PlatformAnnouncementEmailStatus,
  PlatformAnnouncementTarget,
  PlatformAdminRole,
  PlatformAdminStatus,
  Plan,
  Prisma,
  StoredFileStatus,
  UserAccountStatus,
  UserRole,
} from '@prisma/client';
import type { PlatformAdminRequest } from './platform-admin.types';
import type {
  AdminAnalyticsQueryDto,
  AdminAnnouncementRecipientsQueryDto,
  AdminAuditQueryDto,
  AdminEventsQueryDto,
  AdminPaymentsQueryDto,
  AdminPageQueryDto,
  AdminPlatformAdminUpdateDto,
  AdminPlanCatalogueUpdateDto,
  AdminSubscriptionsQueryDto,
} from './admin.dto';
import { PrismaService } from '../prisma/prisma.service';
import { serializePlanCatalogue } from '../subscriptions/plan-entitlements';
import { MailerService } from '../auth/mailer.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import type { AdminAnnouncementCreateDto } from './admin.dto';
import {
  PLATFORM_ADMIN_PERMISSIONS,
  PlatformAdminPermission,
} from './platform-admin.permissions';

const PLAN_VALUES = [Plan.FREE, Plan.PRO, Plan.BUSINESS] as const;
const READY_FILE = { status: StoredFileStatus.READY } as const;
const DAY_MS = 86_400_000;
const DEFAULT_ANALYTICS_RANGE_MS = 30 * DAY_MS;
const MAX_ANALYTICS_RANGE_MS = 366 * DAY_MS;

export interface PageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function pagination(query: AdminPageQueryDto): {
  skip: number;
  take: number;
} {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

function pageMetadata(
  query: AdminPageQueryDto,
  totalItems: number,
): PageMetadata {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}

function safeRequestValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer?: MailerService,
    private readonly objectStorage?: ObjectStorageService,
  ) {}

  async overview(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.overview.read', 'overview', {
      view: 'overview',
    });

    const [
      users,
      verifiedUsers,
      freePlans,
      proPlans,
      businessPlans,
      workspaces,
      members,
      files,
      fileStorage,
      events,
      eventMedia,
      eventMediaStorage,
      recentRegistrations,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      this.prisma.subscription.count({ where: { plan: Plan.FREE } }),
      this.prisma.subscription.count({ where: { plan: Plan.PRO } }),
      this.prisma.subscription.count({ where: { plan: Plan.BUSINESS } }),
      this.prisma.workspace.count(),
      this.prisma.workspaceMember.count(),
      this.prisma.storedFile.count({ where: READY_FILE }),
      this.prisma.storedFile.aggregate({
        where: READY_FILE,
        _sum: { sizeBytes: true },
      }),
      this.prisma.event.count(),
      this.prisma.storedFile.count({
        where: { ...READY_FILE, eventId: { not: null } },
      }),
      this.prisma.storedFile.aggregate({
        where: { ...READY_FILE, eventId: { not: null } },
        _sum: { sizeBytes: true },
      }),
      this.prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { id: true, email: true, name: true, createdAt: true },
      }),
    ]);

    return {
      counts: {
        users,
        verifiedUsers,
        plans: {
          [PLAN_VALUES[0]]: freePlans,
          [PLAN_VALUES[1]]: proPlans,
          [PLAN_VALUES[2]]: businessPlans,
        },
        workspaces,
        members,
        files,
        storageBytes: (fileStorage._sum.sizeBytes ?? 0n).toString(),
        events,
        eventMedia,
        eventMediaStorageBytes: (eventMediaStorage._sum.sizeBytes ?? 0n).toString(),
      },
      recentRegistrations,
    };
  }

  async plans(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.plans.read', 'plan-catalogue', {
      plans: PLAN_VALUES.length,
    });
    const records = await this.prisma.planCatalogue.findMany();
    const byPlan = new Map(records.map((record) => [record.plan, record]));
    return {
      plans: PLAN_VALUES.map((plan) => {
        const record = byPlan.get(plan);
        if (!record) throw new NotFoundException('Plan catalogue record not found');
        return serializePlanCatalogue(record, true);
      }),
    };
  }

  async updatePlan(
    plan: Plan,
    input: AdminPlanCatalogueUpdateDto,
    request: PlatformAdminRequest,
  ) {
    const storageLimitBytes = BigInt(input.storageLimitBytes);
    const monthlyPriceMinor = BigInt(input.monthlyPriceMinor);
    const maxInt64 = 9_223_372_036_854_775_807n;
    if (storageLimitBytes > maxInt64 || monthlyPriceMinor > maxInt64) {
      throw new BadRequestException('Plan byte limits and prices must fit a signed 64-bit integer');
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.planCatalogue.findUnique({ where: { plan } });
      if (!current) throw new NotFoundException('Plan catalogue record not found');

      const updated = await tx.planCatalogue.update({
        where: { plan },
        data: {
          staffLimit: input.staffLimit,
          activeEventLimit: input.activeEventLimit,
          storageLimitBytes,
          canEditDocuments: input.canEditDocuments,
          canScanDocuments: input.canScanDocuments,
          advancedTeamManagement: input.advancedTeamManagement,
          monthlyPriceMinor,
        },
      });

      const affectedSubscriptions = await tx.subscription.findMany({
        where: { plan },
        select: { userId: true },
      });
      const subscriptionUpdates = await tx.subscription.updateMany({
        where: { plan },
        data: { storageLimitBytes },
      });
      const workspaceUpdates = await tx.workspace.updateMany({
        where: { ownerUserId: { in: affectedSubscriptions.map(({ userId }) => userId) } },
        data: { storageLimitBytes },
      });

      await this.auditMutation(
        tx,
        request,
        'admin.plan-catalogue.update',
        'plan-catalogue',
        plan,
        {
          before: this.planAuditSnapshot(current),
          after: this.planAuditSnapshot(updated),
          synchronizedSubscriptionCount: subscriptionUpdates.count,
          synchronizedWorkspaceCount: workspaceUpdates.count,
        },
      );
      return serializePlanCatalogue(updated, true);
    });
  }

  async subscriptions(query: AdminSubscriptionsQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.subscriptions.read', 'subscription', {
      page: query.page,
      pageSize: query.pageSize,
      plan: query.plan ?? null,
      searchApplied: Boolean(query.q),
    });

    const where: Prisma.SubscriptionWhereInput = {
      ...(query.plan ? { plan: query.plan } : {}),
      ...(query.q
        ? {
            user: {
              is: {
                OR: [
                  { email: { contains: query.q, mode: 'insensitive' } },
                  { name: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };
    const { skip, take } = pagination(query);
    const [totalItems, records, planCounts] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { userId: 'asc' }],
        skip,
        take,
        select: {
          userId: true,
          plan: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          updatedAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.subscription.groupBy({
        by: ['plan'],
        _count: { _all: true },
      }),
    ]);

    return {
      items: records,
      countsByPlan: PLAN_VALUES.map((plan) => ({
        plan,
        count: planCounts.find((entry) => entry.plan === plan)?._count._all ?? 0,
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async payments(query: AdminPaymentsQueryDto, request: PlatformAdminRequest) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && (to <= from || to.getTime() - from.getTime() > MAX_ANALYTICS_RANGE_MS)) {
      throw new BadRequestException(
        'Payment date range must have from before to and span no more than 366 days',
      );
    }

    const createdAt: Prisma.DateTimeFilter = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    };
    const dateFilter: Prisma.PaymentAttemptWhereInput = Object.keys(createdAt).length
      ? { createdAt }
      : {};
    await this.auditRead(request, 'admin.payments.read', 'payment-attempt', {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status ?? null,
      plan: query.plan ?? null,
      dateRangeApplied: Boolean(from || to),
      searchApplied: Boolean(query.q),
    });

    const where: Prisma.PaymentAttemptWhereInput = {
      ...dateFilter,
      ...(query.status ? { status: query.status } : {}),
      ...(query.plan ? { plan: query.plan } : {}),
      ...(query.q
        ? {
            user: {
              is: {
                OR: [
                  { email: { contains: query.q, mode: 'insensitive' } },
                  { name: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };
    const { skip, take } = pagination(query);
    const [totalItems, records, revenue, countsByStatus] = await Promise.all([
      this.prisma.paymentAttempt.count({ where }),
      this.prisma.paymentAttempt.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          checkoutId: true,
          plan: true,
          amountMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          paidAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.paymentAttempt.groupBy({
        by: ['currency'],
        where: { ...dateFilter, status: PaymentAttemptStatus.SUCCEEDED },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      this.prisma.paymentAttempt.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { _all: true },
      }),
    ]);

    return {
      items: records.map(({ amountMinor, ...record }) => ({
        ...record,
        amountMinor: amountMinor.toString(),
      })),
      revenueByCurrency: revenue.map(({ currency, _sum, _count }) => ({
        currency,
        amountMinor: (_sum.amountMinor ?? 0n).toString(),
        paymentCount: _count._all,
      })),
      countsByStatus: countsByStatus.map(({ status, _count }) => ({
        status,
        count: _count._all,
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async platformAdminPermissions(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.platform-admins.permissions.read', 'platform-admin-role', {
      roleCount: Object.keys(PLATFORM_ADMIN_PERMISSIONS).length,
    });
    return {
      roles: Object.entries(PLATFORM_ADMIN_PERMISSIONS).map(([role, permissions]) => ({
        role,
        permissions,
      })),
      availablePermissions: Object.values(PlatformAdminPermission),
    };
  }

  async platformAdmins(query: AdminPageQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.platform-admins.read', 'platform-admin', {
      page: query.page,
      pageSize: query.pageSize,
      searchApplied: Boolean(query.q),
    });

    const where: Prisma.PlatformAdminProfileWhereInput = {
      user: {
        is: {
          role: UserRole.ADMIN,
          ...(query.q
            ? {
                OR: [
                  { email: { contains: query.q, mode: 'insensitive' } },
                  { name: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
    };
    const { skip, take } = pagination(query);
    const [totalItems, profiles] = await Promise.all([
      this.prisma.platformAdminProfile.count({ where }),
      this.prisma.platformAdminProfile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
        skip,
        take,
        select: {
          userId: true,
          role: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);
    return {
      items: profiles,
      page: pageMetadata(query, totalItems),
    };
  }

  async updatePlatformAdmin(
    userId: string,
    input: AdminPlatformAdminUpdateDto,
    request: PlatformAdminRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.platformAdminProfile.findUnique({
        where: { userId },
        select: {
          userId: true,
          role: true,
          status: true,
          user: { select: { role: true } },
        },
      });
      if (!current || current.user.role !== UserRole.ADMIN) {
        throw new NotFoundException('Platform administrator not found');
      }

      const isSelf = userId === request.platformAdmin.id;
      const changingSelfAccess = input.role !== current.role || input.status !== current.status;
      if (isSelf && changingSelfAccess) {
        throw new BadRequestException('You cannot change your own platform-admin access');
      }

      if (
        current.role === PlatformAdminRole.SUPER_ADMIN
        && current.status === PlatformAdminStatus.ACTIVE
        && (input.role !== current.role || input.status !== current.status)
      ) {
        const activeSuperAdmins = await tx.platformAdminProfile.count({
          where: {
            role: PlatformAdminRole.SUPER_ADMIN,
            status: PlatformAdminStatus.ACTIVE,
          },
        });
        if (activeSuperAdmins <= 1) {
          throw new BadRequestException('The last active Super Admin cannot be demoted or suspended');
        }
      }

      const updated = await tx.platformAdminProfile.update({
        where: { userId },
        data: { role: input.role, status: input.status },
        select: {
          userId: true,
          role: true,
          status: true,
          user: { select: { name: true, email: true } },
        },
      });
      await this.auditMutation(
        tx,
        request,
        'admin.platform-admin.update',
        'platform-admin',
        userId,
        {
          before: { role: current.role, status: current.status },
          after: { role: updated.role, status: updated.status },
        },
      );
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async storageInventory(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.storage-inventory.read', 'storage-inventory', {
      scope: 'ready-files',
      largestLimit: 10,
    });

    const [
      summary,
      usersByUsage,
      workspacesByUsage,
      mimeTypesByCount,
    ] = await Promise.all([
      this.prisma.storedFile.aggregate({
        where: READY_FILE,
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.prisma.storedFile.groupBy({
        by: ['userId'],
        where: READY_FILE,
        _count: { _all: true },
        _sum: { sizeBytes: true },
        orderBy: [
          { _sum: { sizeBytes: 'desc' } },
          { userId: 'asc' },
        ],
        take: 10,
      }),
      this.prisma.storedFile.groupBy({
        by: ['workspaceId'],
        where: { ...READY_FILE, workspaceId: { not: null } },
        _count: { _all: true },
        _sum: { sizeBytes: true },
        orderBy: [
          { _sum: { sizeBytes: 'desc' } },
          { workspaceId: 'asc' },
        ],
        take: 10,
      }),
      this.prisma.storedFile.groupBy({
        by: ['mimeType'],
        where: READY_FILE,
        _count: { _all: true },
        _sum: { sizeBytes: true },
        orderBy: [
          { _count: { mimeType: 'desc' } },
          { mimeType: 'asc' },
        ],
      }),
    ]);

    const userIds = usersByUsage.map(({ userId }) => userId);
    const workspaceIds = workspacesByUsage
      .map(({ workspaceId }) => workspaceId)
      .filter((id): id is string => id !== null);
    const [users, workspaces] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

    return {
      summary: {
        readyFileCount: summary._count._all,
        readyBytes: (summary._sum.sizeBytes ?? 0n).toString(),
      },
      largestUsers: usersByUsage.flatMap((usage) => {
        const user = userById.get(usage.userId);
        return user
          ? [{
              userId: user.id,
              name: user.name,
              email: user.email,
              readyFileCount: usage._count._all,
              usedBytes: (usage._sum.sizeBytes ?? 0n).toString(),
            }]
          : [];
      }),
      largestWorkspaces: workspacesByUsage.flatMap((usage) => {
        if (usage.workspaceId === null) return [];
        const workspace = workspaceById.get(usage.workspaceId);
        return workspace
          ? [{
              workspaceId: workspace.id,
              name: workspace.name,
              owner: workspace.owner,
              readyFileCount: usage._count._all,
              usedBytes: (usage._sum.sizeBytes ?? 0n).toString(),
            }]
          : [];
      }),
      mimeTypes: mimeTypesByCount.map((usage) => ({
        mimeType: usage.mimeType,
        readyFileCount: usage._count._all,
        usedBytes: (usage._sum?.sizeBytes ?? 0n).toString(),
      })),
    };
  }

  async uploadMonitoring(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.upload-monitoring.read', 'stored-file', {
      metadataOnly: true,
    });

    const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
    const [
      byStatus,
      bySource,
      byMimeType,
      totalReady,
      staleProcessing,
      scannedUploads,
    ] = await Promise.all([
      this.prisma.storedFile.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.storedFile.groupBy({
        by: ['uploadSource'],
        _count: { _all: true },
      }),
      this.prisma.storedFile.groupBy({
        by: ['mimeType'],
        where: READY_FILE,
        _count: { _all: true },
        _sum: { sizeBytes: true },
        orderBy: [{ _count: { mimeType: 'desc' } }, { mimeType: 'asc' }],
        take: 20,
      }),
      this.prisma.storedFile.aggregate({
        where: READY_FILE,
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.prisma.storedFile.count({
        where: {
          status: { in: [StoredFileStatus.UPLOADING, StoredFileStatus.DELETING] },
          createdAt: { lt: staleBefore },
        },
      }),
      this.prisma.storedFile.count({ where: { uploadSource: 'SCAN', ...READY_FILE } }),
    ]);

    const statusCounts = Object.fromEntries(
      byStatus.map(({ status, _count }) => [status, _count._all]),
    );
    const sourceCounts = Object.fromEntries(
      bySource.map(({ uploadSource, _count }) => [uploadSource, _count._all]),
    );

    return {
      totals: {
        readyFiles: totalReady._count._all,
        readyBytes: (totalReady._sum.sizeBytes ?? 0n).toString(),
        scanUploads: scannedUploads,
        staleProcessingRecords: staleProcessing,
      },
      byStatus: {
        UPLOADING: statusCounts[StoredFileStatus.UPLOADING] ?? 0,
        READY: statusCounts[StoredFileStatus.READY] ?? 0,
        DELETING: statusCounts[StoredFileStatus.DELETING] ?? 0,
      },
      bySource: {
        STANDARD: sourceCounts.STANDARD ?? 0,
        SCAN: sourceCounts.SCAN ?? 0,
        EVENT_MEDIA: sourceCounts.EVENT_MEDIA ?? 0,
      },
      mimeTypes: byMimeType.map(({ mimeType, _count, _sum }) => ({
        mimeType,
        readyFileCount: _count._all,
        readyBytes: (_sum.sizeBytes ?? 0n).toString(),
      })),
      notTracked: [
        'Historical failed uploads',
        'OCR and document-conversion jobs',
        'Malware scanning results',
        'Backup health',
      ],
    };
  }

  async systemHealth(request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.platform-health.read', 'platform-health', {
      detail: 'service-status',
    });

    const [database, objectStorage, email] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'healthy' as const,
        () => 'unavailable' as const,
      ),
      this.objectStorage?.healthCheck() ?? Promise.resolve({
        status: 'not-configured' as const,
        driver: 'unknown',
      }),
      this.mailer?.healthCheck() ?? Promise.resolve('not-configured' as const),
    ]);
    const checks = { database, objectStorage, email };
    const status = Object.values(checks).every((value) =>
      typeof value === 'string' ? value === 'healthy' : value.status === 'healthy',
    ) ? 'healthy' : 'degraded';

    return {
      checkedAt: new Date().toISOString(),
      status,
      checks,
      integrations: {
        backups: 'not-integrated',
        OCR: 'not-integrated',
        malwareScanning: 'not-integrated',
      },
    };
  }

  async announcements(query: AdminPageQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.announcements.read', 'platform-announcement', {
      page: query.page,
      pageSize: query.pageSize,
    });
    const { skip, take } = pagination(query);
    const [totalItems, records, emailDeliveryGroups] = await Promise.all([
      this.prisma.platformAnnouncement.count(),
      this.prisma.platformAnnouncement.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          title: true,
          body: true,
          audience: true,
          target: true,
          signupWindowMinutes: true,
          emailEnabled: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
      }),
      this.prisma.platformAnnouncementDelivery.groupBy({
        by: ['announcementId', 'emailStatus'],
        _count: { _all: true },
      }),
    ]);
    const emailStatusCounts = new Map<string, Record<string, number>>();
    for (const { announcementId, emailStatus, _count } of emailDeliveryGroups) {
      const current = emailStatusCounts.get(announcementId) ?? {};
      current[emailStatus] = _count._all;
      emailStatusCounts.set(announcementId, current);
    }

    return {
      items: records.map(({ _count, ...record }) => ({
        ...record,
        recipientCount: _count.deliveries,
        emailDelivery: emailStatusCounts.get(record.id) ?? {},
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async announcementRecipients(
    query: AdminAnnouncementRecipientsQueryDto,
    request: PlatformAdminRequest,
  ) {
    if (!query.q && query.createdWithinMinutes === undefined && query.audience === undefined) {
      throw new BadRequestException('Search for a customer or choose a recipient filter');
    }
    if (query.q && query.q.length < 2) {
      throw new BadRequestException('Enter at least two characters to search for customers');
    }
    const planByAudience: Partial<Record<PlatformAnnouncementAudience, Plan>> = {
      [PlatformAnnouncementAudience.FREE]: Plan.FREE,
      [PlatformAnnouncementAudience.PRO]: Plan.PRO,
      [PlatformAnnouncementAudience.BUSINESS]: Plan.BUSINESS,
    };
    const selectedPlan = query.audience ? planByAudience[query.audience] : undefined;
    const where: Prisma.UserWhereInput = {
      role: UserRole.USER,
      accountStatus: UserAccountStatus.ACTIVE,
      ...(selectedPlan ? { subscription: { is: { plan: selectedPlan } } } : {}),
      ...(query.createdWithinMinutes !== undefined
        ? { createdAt: { gte: new Date(Date.now() - query.createdWithinMinutes * 60_000) } }
        : {}),
      ...(query.q
        ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ],
        }
        : {}),
    };
    await this.auditRead(request, 'admin.announcement.recipients.read', 'user', {
      searchApplied: Boolean(query.q),
      createdWithinMinutes: query.createdWithinMinutes ?? null,
      audience: query.audience ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
    const { skip, take } = pagination(query);
    const [totalItems, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
    ]);
    return { items, page: pageMetadata(query, totalItems) };
  }

  async createAnnouncement(
    input: AdminAnnouncementCreateDto,
    request: PlatformAdminRequest,
  ) {
    if (input.emailEnabled && !this.mailer?.isSmtpConfigured()) {
      throw new ServiceUnavailableException(
        'Configure SMTP email delivery before sending announcements by email.',
      );
    }

    if (input.target === PlatformAnnouncementTarget.SIGNUP_WINDOW
      && input.signupWindowMinutes === undefined) {
      throw new BadRequestException('Choose how recently recipients must have signed up');
    }
    if (input.target !== PlatformAnnouncementTarget.SIGNUP_WINDOW && input.signupWindowMinutes !== undefined) {
      throw new BadRequestException('Signup window is only valid for recent-signup announcements');
    }
    if (input.target === PlatformAnnouncementTarget.SELECTED && !input.userIds?.length) {
      throw new BadRequestException('Select at least one active customer');
    }
    if (input.target !== PlatformAnnouncementTarget.SELECTED && input.userIds?.length) {
      throw new BadRequestException('Selected customers are only valid for individual targeting');
    }
    const planByAudience: Partial<Record<PlatformAnnouncementAudience, Plan>> = {
      [PlatformAnnouncementAudience.FREE]: Plan.FREE,
      [PlatformAnnouncementAudience.PRO]: Plan.PRO,
      [PlatformAnnouncementAudience.BUSINESS]: Plan.BUSINESS,
    };
    const selectedPlan = input.target === PlatformAnnouncementTarget.AUDIENCE
      ? planByAudience[input.audience]
      : undefined;
    const audienceFilter: Prisma.UserWhereInput = {
      ...(selectedPlan ? { subscription: { is: { plan: selectedPlan } } } : {}),
      ...(input.target === PlatformAnnouncementTarget.SIGNUP_WINDOW && input.signupWindowMinutes !== undefined
        ? { createdAt: { gte: new Date(Date.now() - input.signupWindowMinutes * 60_000) } }
        : {}),
      ...(input.target === PlatformAnnouncementTarget.SELECTED ? { id: { in: input.userIds } } : {}),
    };
    const recipients = await this.prisma.user.findMany({
      where: {
        role: UserRole.USER,
        accountStatus: UserAccountStatus.ACTIVE,
        ...audienceFilter,
      },
      select: { id: true },
    });
    if (input.target === PlatformAnnouncementTarget.SELECTED && recipients.length !== input.userIds?.length) {
      throw new BadRequestException('One or more selected customers are inactive or unavailable');
    }
    if (!recipients.length) throw new BadRequestException('The selected audience has no active accounts');

    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.platformAnnouncement.create({
        data: {
          title: input.title,
          body: input.body,
          audience: input.audience,
          target: input.target,
          signupWindowMinutes: input.signupWindowMinutes ?? null,
          emailEnabled: input.emailEnabled,
          createdByUserId: request.platformAdmin.id,
        },
        select: {
          id: true,
          title: true,
          audience: true,
          target: true,
          signupWindowMinutes: true,
          emailEnabled: true,
          createdAt: true,
        },
      });
      await tx.platformAnnouncementDelivery.createMany({
        data: recipients.map(({ id: userId }) => ({
          announcementId: announcement.id,
          userId,
          emailStatus: input.emailEnabled
            ? PlatformAnnouncementEmailStatus.PENDING
            : PlatformAnnouncementEmailStatus.NOT_REQUESTED,
        })),
      });
      await this.auditMutation(
        tx,
        request,
        'admin.announcement.create',
        'platform-announcement',
        announcement.id,
        {
          audience: input.audience,
          target: input.target,
          signupWindowMinutes: input.signupWindowMinutes ?? null,
          recipientCount: recipients.length,
          emailEnabled: input.emailEnabled,
        },
      );

      return { ...announcement, recipientCount: recipients.length };
    });
  }

  async retryAnnouncementEmail(announcementId: string, request: PlatformAdminRequest) {
    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.platformAnnouncement.findUnique({
        where: { id: announcementId },
        select: { id: true, emailEnabled: true },
      });
      if (!announcement) throw new NotFoundException('Announcement not found');
      if (!announcement.emailEnabled) {
        throw new BadRequestException('This announcement was not configured for email delivery');
      }
      if (!this.mailer?.isSmtpConfigured()) {
        throw new ServiceUnavailableException('SMTP email delivery is not currently configured');
      }

      const queued = await tx.platformAnnouncementDelivery.updateMany({
        where: {
          announcementId,
          emailStatus: PlatformAnnouncementEmailStatus.FAILED,
        },
        data: {
          emailStatus: PlatformAnnouncementEmailStatus.PENDING,
          emailLastError: null,
        },
      });
      await this.auditMutation(
        tx,
        request,
        'admin.announcement.email.retry',
        'platform-announcement',
        announcementId,
        { queuedRecipientCount: queued.count },
      );
      return { announcementId, queuedRecipientCount: queued.count };
    });
  }

  async analytics(query: AdminAnalyticsQueryDto, request: PlatformAdminRequest) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_ANALYTICS_RANGE_MS);
    const rangeMs = to.getTime() - from.getTime();
    if (
      !Number.isFinite(from.getTime())
      || !Number.isFinite(to.getTime())
      || rangeMs <= 0
      || rangeMs > MAX_ANALYTICS_RANGE_MS
    ) {
      throw new BadRequestException(
        'Analytics range must have from before to and span no more than 366 days',
      );
    }

    await this.auditRead(request, 'admin.analytics.read', 'analytics', {
      from: from.toISOString(),
      to: to.toISOString(),
      rangeEndExclusive: true,
    });

    const [registrationRows, subscriptionGroups] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; count: number }>>`
        SELECT date_trunc('day', "createdAt") AS "day",
               COUNT(*)::integer AS "count"
        FROM "User"
        WHERE "role" = ${UserRole.USER}::"UserRole"
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY date_trunc('day', "createdAt")
        ORDER BY "day" ASC
      `,
      this.prisma.subscription.groupBy({
        by: ['plan'],
        _count: { _all: true },
      }),
    ]);
    const registrationsByDay = new Map(
      registrationRows.map(({ day, count }) => [
        new Date(day).toISOString().slice(0, 10),
        count,
      ]),
    );
    const dailyRegistrations: Array<{ day: string; count: number }> = [];
    const firstDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    for (let day = firstDay; day < to.getTime(); day += DAY_MS) {
      const key = new Date(day).toISOString().slice(0, 10);
      dailyRegistrations.push({ day: key, count: registrationsByDay.get(key) ?? 0 });
    }
    const subscriptionCountByPlan = new Map(
      subscriptionGroups.map(({ plan, _count }) => [plan, _count._all]),
    );

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        endExclusive: true,
        timezone: 'UTC',
      },
      registrationsByDay: dailyRegistrations,
      subscriptionDistribution: PLAN_VALUES.map((plan) => ({
        plan,
        count: subscriptionCountByPlan.get(plan) ?? 0,
      })),
      notComputed: ['MRR', 'DAU', 'churn'],
    };
  }

  async users(query: AdminPageQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.users.read', 'user', {
      page: query.page,
      pageSize: query.pageSize,
      searchApplied: Boolean(query.q),
    });

    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const { skip, take } = pagination(query);
    const [totalItems, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          accountStatus: true,
          emailVerifiedAt: true,
          createdAt: true,
          subscription: { select: { plan: true } },
        },
      }),
    ]);

    return {
      items: items.map(({ emailVerifiedAt, ...user }) => ({
        ...user,
        emailVerified: Boolean(emailVerifiedAt),
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async userDetails(userId: string, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.user.detail.read', 'user', {
      detail: 'account-metadata',
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        accountStatus: true,
        emailVerifiedAt: true,
        createdAt: true,
        subscription: {
          select: {
            plan: true,
            storageLimitBytes: true,
            storageUsedBytes: true,
            storageReservedBytes: true,
          },
        },
        ownedWorkspaces: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            name: true,
            createdAt: true,
            storageLimitBytes: true,
            storageUsedBytes: true,
            _count: { select: { members: true, files: true } },
          },
        },
        memberships: {
          where: { status: 'ACTIVE' },
          orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
          select: {
            role: true,
            joinedAt: true,
            workspace: { select: { id: true, name: true } },
          },
        },
        _count: { select: { files: true, events: true, supportTickets: true } },
      },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const now = new Date();
    const permissions = PLATFORM_ADMIN_PERMISSIONS[
      request.platformAdmin.platformAdminProfile.role
    ];
    const canViewPaymentHistory = permissions.includes(PlatformAdminPermission.PAYMENTS_READ);
    const canViewSupportHistory = permissions.includes(PlatformAdminPermission.SUPPORT_TICKETS_READ);
    const [readyFiles, activeSessions, sessions, paymentHistory, supportHistory] = await Promise.all([
      this.prisma.storedFile.aggregate({
        where: { userId, status: READY_FILE.status },
        _sum: { sizeBytes: true },
      }),
      this.prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          userAgent: true,
        },
      }),
      this.prisma.session.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          userAgent: true,
          revokedAt: true,
          expiresAt: true,
        },
      }),
      canViewPaymentHistory
        ? this.prisma.paymentAttempt.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 20,
            select: {
              id: true,
              plan: true,
              amountMinor: true,
              currency: true,
              status: true,
              createdAt: true,
              paidAt: true,
            },
          })
        : Promise.resolve(null),
      canViewSupportHistory
        ? this.prisma.supportTicket.groupBy({
            by: ['status'],
            where: { userId },
            _count: { _all: true },
          })
        : Promise.resolve(null),
    ]);

    const {
      emailVerifiedAt,
      ownedWorkspaces,
      memberships,
      subscription,
      _count,
      ...account
    } = user;
    const safeActiveSessions = activeSessions.map(
      ({ id, createdAt, lastSeenAt, userAgent }) => ({
        id,
        createdAt,
        lastSeenAt,
        userAgent,
      }),
    );
    const loginHistory = sessions.map(
      ({ id, createdAt, lastSeenAt, userAgent, revokedAt, expiresAt }) => ({
        id,
        createdAt,
        lastSeenAt,
        userAgent,
        status: revokedAt ? 'REVOKED' : expiresAt > now ? 'ACTIVE' : 'EXPIRED',
      }),
    );
    const supportHistoryCounts = supportHistory?.reduce(
      (counts, { status, _count: count }) => {
        counts[status] = count._all;
        return counts;
      },
      { OPEN: 0, PENDING: 0, RESOLVED: 0 },
    ) ?? null;
    return {
      ...account,
      emailVerified: Boolean(emailVerifiedAt),
      subscription: subscription
        ? {
            ...subscription,
            storageLimitBytes: subscription.storageLimitBytes.toString(),
            storageUsedBytes: subscription.storageUsedBytes.toString(),
            storageReservedBytes: subscription.storageReservedBytes.toString(),
          }
        : null,
      activity: {
        fileCount: _count.files,
        eventCount: _count.events,
        readyFileBytes: (readyFiles._sum.sizeBytes ?? 0n).toString(),
        activeSessionCount: activeSessions.length,
      },
      paymentHistory: paymentHistory?.map(({ amountMinor, ...payment }) => ({
        ...payment,
        amountMinor: amountMinor.toString(),
      })) ?? null,
      supportHistory: supportHistoryCounts
        ? { total: _count.supportTickets, ...supportHistoryCounts }
        : null,
      activeSessions: safeActiveSessions,
      loginHistory,
      businesses: ownedWorkspaces.map(({ storageLimitBytes, storageUsedBytes, _count: count, ...workspace }) => ({
        ...workspace,
        memberCount: count.members,
        fileCount: count.files,
        storage: {
          usedBytes: storageUsedBytes.toString(),
          limitBytes: storageLimitBytes.toString(),
        },
      })),
      memberships,
    };
  }

  async businesses(query: AdminPageQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.businesses.read', 'workspace', {
      page: query.page,
      pageSize: query.pageSize,
      searchApplied: Boolean(query.q),
    });

    const where: Prisma.WorkspaceWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { owner: { name: { contains: query.q, mode: 'insensitive' } } },
            { owner: { email: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {};
    const { skip, take } = pagination(query);
    const [totalItems, items] = await Promise.all([
      this.prisma.workspace.count({ where }),
      this.prisma.workspace.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          name: true,
          createdAt: true,
          storageUsedBytes: true,
          storageLimitBytes: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true } },
        },
      }),
    ]);

    return {
      items: items.map(({ _count, storageUsedBytes, storageLimitBytes, ...workspace }) => ({
        ...workspace,
        memberCount: _count.members,
        storage: {
          usedBytes: storageUsedBytes.toString(),
          limitBytes: storageLimitBytes.toString(),
        },
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async businessDetails(workspaceId: string, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.business.detail.read', 'workspace', {
      detail: 'business-metadata',
    });

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        storageUsedBytes: true,
        storageLimitBytes: true,
        owner: { select: { id: true, name: true, email: true } },
        members: {
          where: { status: { not: 'REMOVED' } },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            role: true,
            status: true,
            displayName: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { files: true, folders: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Business not found');

    const [readyFiles, eventCount] = await Promise.all([
      this.prisma.storedFile.aggregate({
        where: { workspaceId, status: READY_FILE.status },
        _sum: { sizeBytes: true },
      }),
      this.prisma.event.count({ where: { folder: { workspaceId } } }),
    ]);
    const { storageUsedBytes, storageLimitBytes, _count, ...details } = workspace;
    return {
      ...details,
      storage: {
        usedBytes: storageUsedBytes.toString(),
        limitBytes: storageLimitBytes.toString(),
        readyFileBytes: (readyFiles._sum.sizeBytes ?? 0n).toString(),
      },
      fileCount: _count.files,
      folderCount: _count.folders,
      eventCount,
    };
  }

  async events(query: AdminEventsQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.events.read', 'event-directory', {
      page: query.page,
      pageSize: query.pageSize,
      searchApplied: Boolean(query.q),
      ...(query.status ? { status: query.status } : {}),
      ...(query.gallerySetting ? { gallerySetting: query.gallerySetting } : {}),
    });

    const conditions: Prisma.EventWhereInput[] = [];
    if (query.q) {
      conditions.push({ name: { contains: query.q, mode: 'insensitive' } });
    }
    if (query.status) conditions.push({ status: query.status as EventStatus });
    if (query.gallerySetting) {
      conditions.push({ gallerySetting: query.gallerySetting as EventGallerySetting });
    }
    const where: Prisma.EventWhereInput = conditions.length
      ? { AND: conditions }
      : {};
    const { skip, take } = pagination(query);
    const [totalItems, records] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          name: true,
          date: true,
          createdAt: true,
          status: true,
          gallerySetting: true,
          owner: { select: { id: true, name: true, email: true } },
          folder: {
            select: {
              workspace: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);
    return {
      items: records.map(({ folder, ...event }) => ({
        ...event,
        workspace: folder.workspace,
      })),
      page: pageMetadata(query, totalItems),
    };
  }

  async auditPasswordResetRequest(
    userId: string,
    request: PlatformAdminRequest,
  ): Promise<void> {
    await this.auditRead(
      request,
      'admin.user.password-reset.request',
      'user',
      { userId, delivery: 'email-reset-code' },
    );
  }

  async auditVerificationResendRequest(
    userId: string,
    request: PlatformAdminRequest,
  ): Promise<void> {
    await this.auditRead(
      request,
      'admin.user.verification.resend',
      'user',
      { userId, delivery: 'email-verification-code' },
    );
  }

  async setUserStatus(
    userId: string,
    status: UserAccountStatus,
    request: PlatformAdminRequest,
  ) {
    if (
      userId === request.platformAdmin.id
      && status === UserAccountStatus.SUSPENDED
    ) {
      throw new ForbiddenException('Administrators cannot suspend their own account');
    }

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.user.updateMany({
        where: { id: userId },
        data: { accountStatus: status },
      });
      if (!updated.count) throw new NotFoundException('Customer not found');

      const revokedSessions = status === UserAccountStatus.SUSPENDED
        ? await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          })
        : { count: 0 };

      await this.auditMutation(
        tx,
        request,
        status === UserAccountStatus.SUSPENDED
          ? 'admin.user.suspend'
          : 'admin.user.reactivate',
        'user',
        userId,
        { status, revokedSessionCount: revokedSessions.count },
      );

      return {
        id: userId,
        status,
        revokedSessionCount: revokedSessions.count,
      };
    });
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    request: PlatformAdminRequest,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!revoked.count) throw new NotFoundException('Active session not found');
      await this.auditMutation(
        tx,
        request,
        'admin.user.session.revoke',
        'session',
        sessionId,
        { userId },
      );
    });
  }

  async auditLogs(query: AdminAuditQueryDto, request: PlatformAdminRequest) {
    await this.auditRead(request, 'admin.audit-log.read', 'platform-admin-audit', {
      page: query.page,
      pageSize: query.pageSize,
      searchApplied: Boolean(query.q || query.action || query.resourceType),
    });

    const searchConditions: Prisma.PlatformAdminAuditLogWhereInput[] = [];
    if (query.q) {
      searchConditions.push({
        OR: [
          { action: { contains: query.q, mode: 'insensitive' } },
          { resourceType: { contains: query.q, mode: 'insensitive' } },
          { resourceId: { contains: query.q, mode: 'insensitive' } },
          { actor: { email: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.action) searchConditions.push({ action: query.action });
    if (query.resourceType) {
      searchConditions.push({ resourceType: query.resourceType });
    }
    const where: Prisma.PlatformAdminAuditLogWhereInput = searchConditions.length
      ? { AND: searchConditions }
      : {};
    const { skip, take } = pagination(query);
    const [totalItems, items] = await Promise.all([
      this.prisma.platformAdminAuditLog.count({ where }),
      this.prisma.platformAdminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          actorId: true,
          action: true,
          resourceType: true,
          resourceId: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          actor: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);
    return { items, page: pageMetadata(query, totalItems) };
  }

  private planAuditSnapshot(
    catalogue: Prisma.PlanCatalogueGetPayload<{}>,
  ): Prisma.InputJsonObject {
    return {
      plan: catalogue.plan,
      staffLimit: catalogue.staffLimit,
      activeEventLimit: catalogue.activeEventLimit,
      storageLimitBytes: catalogue.storageLimitBytes.toString(),
      canEditDocuments: catalogue.canEditDocuments,
      canScanDocuments: catalogue.canScanDocuments,
      advancedTeamManagement: catalogue.advancedTeamManagement,
      monthlyPriceMinor: catalogue.monthlyPriceMinor.toString(),
      currency: catalogue.currency,
    };
  }

  private async auditRead(
    request: PlatformAdminRequest,
    action: string,
    resourceType: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    const actorId = request.platformAdmin.id;
    if (!actorId) {
      throw new InternalServerErrorException('Admin audit context unavailable');
    }
    await this.prisma.platformAdminAuditLog.create({
      data: {
        actorId,
        action,
        resourceType,
        metadata,
        ipAddress: safeRequestValue(request.ip, 64),
        userAgent: safeRequestValue(request.get('user-agent'), 512),
      },
      select: { id: true },
    });
  }

  private async auditMutation(
    tx: Prisma.TransactionClient,
    request: PlatformAdminRequest,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    const actorId = request.platformAdmin.id;
    if (!actorId) {
      throw new InternalServerErrorException('Admin audit context unavailable');
    }
    await tx.platformAdminAuditLog.create({
      data: {
        actorId,
        action,
        resourceType,
        resourceId,
        metadata,
        ipAddress: safeRequestValue(request.ip, 64),
        userAgent: safeRequestValue(request.get('user-agent'), 512),
      },
      select: { id: true },
    });
  }
}
