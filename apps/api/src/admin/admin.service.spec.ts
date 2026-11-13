jest.mock('@nestjs/common', () => ({
  BadRequestException: class BadRequestException extends Error {},
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => (target: unknown) => target,
  InternalServerErrorException: class InternalServerErrorException extends Error {},
  NotFoundException: class NotFoundException extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import type { PrismaService } from '../prisma/prisma.service';
import type { PlatformAdminRequest } from './platform-admin.types';
import { AdminService } from './admin.service';

function makeRequest(id = 'admin-id'): PlatformAdminRequest {
  return {
    ip: '192.0.2.9',
    get: jest.fn().mockReturnValue('Test Agent'),
    platformAdmin: {
      id,
      email: 'admin@example.test',
      name: 'Admin',
      role: 'ADMIN' as never,
      emailVerifiedAt: new Date(),
      platformAdminProfile: { role: 'SUPER_ADMIN' as never, status: 'ACTIVE' as never },
    },
  } as unknown as PlatformAdminRequest;
}

describe('AdminService read APIs', () => {
  it('lists subscription metadata with plan totals and audited filters', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const findMany = jest.fn().mockResolvedValue([{
      userId: 'customer-id',
      plan: 'PRO',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      user: { name: 'Customer', email: 'customer@example.test' },
    }]);
    const count = jest.fn().mockResolvedValue(1);
    const groupBy = jest.fn().mockResolvedValue([
      { plan: 'PRO', _count: { _all: 1 } },
    ]);
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      subscription: { findMany, count, groupBy },
    } as unknown as PrismaService);

    const result = await service.subscriptions(
      { page: 1, pageSize: 10, plan: 'PRO' as never, q: 'customer' },
      makeRequest(),
    );

    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.subscriptions.read',
        resourceType: 'subscription',
        metadata: { page: 1, pageSize: 10, plan: 'PRO', searchApplied: true },
      }),
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plan: 'PRO',
        user: { is: { OR: expect.any(Array) } },
      }),
    }));
    expect(result).toMatchObject({
      items: [{ userId: 'customer-id', user: { email: 'customer@example.test' } }],
      countsByPlan: [
        { plan: 'FREE', count: 0 },
        { plan: 'PRO', count: 1 },
        { plan: 'BUSINESS', count: 0 },
      ],
      page: { totalItems: 1 },
    });
  });

  it('reports successful payment revenue by currency, separate from list filters', async () => {
    const paymentAttempt = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{
        id: 'attempt-id',
        checkoutId: 'checkout-id',
        plan: 'PRO',
        amountMinor: 12_500n,
        currency: 'NGN',
        status: 'PENDING',
        createdAt: new Date('2026-01-15T12:00:00Z'),
        paidAt: null,
        user: { id: 'customer-id', name: 'Customer', email: 'customer@example.test' },
      }]),
      groupBy: jest.fn(({ by }: { by: string[] }) => Promise.resolve(
        by[0] === 'currency'
          ? [{ currency: 'NGN', _sum: { amountMinor: 80_000n }, _count: { _all: 2 } }]
          : [{ status: 'SUCCEEDED', _count: { _all: 2 } }, { status: 'PENDING', _count: { _all: 1 } }],
      )),
    };
    const service = new AdminService({
      platformAdminAuditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
      paymentAttempt,
    } as unknown as PrismaService);

    const result = await service.payments({
      page: 1,
      pageSize: 10,
      status: 'PENDING' as never,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    }, makeRequest());

    expect(paymentAttempt.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PENDING' }),
    }));
    expect(paymentAttempt.groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      by: ['currency'],
      where: expect.objectContaining({ status: 'SUCCEEDED' }),
    }));
    expect(result).toMatchObject({
      items: [{ amountMinor: '12500', status: 'PENDING' }],
      revenueByCurrency: [{ currency: 'NGN', amountMinor: '80000', paymentCount: 2 }],
      countsByStatus: [{ status: 'SUCCEEDED', count: 2 }, { status: 'PENDING', count: 1 }],
    });
  });

  it('updates administrator access in a transaction and audits the role change', async () => {
    const update = jest.fn().mockResolvedValue({
      userId: 'target-admin-id',
      role: 'FINANCE_ADMIN',
      status: 'ACTIVE',
      user: { name: 'Target Admin', email: 'target@example.test' },
    });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const tx = {
      platformAdminProfile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'target-admin-id',
          role: 'SUPPORT_ADMIN',
          status: 'ACTIVE',
          user: { role: 'ADMIN' },
        }),
        update,
      },
      platformAdminAuditLog: { create: auditCreate },
    };
    const transaction = jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
    const service = new AdminService({ $transaction: transaction } as unknown as PrismaService);

    await expect(service.updatePlatformAdmin('target-admin-id', {
      role: 'FINANCE_ADMIN' as never,
      status: 'ACTIVE' as never,
    }, makeRequest())).resolves.toMatchObject({
      userId: 'target-admin-id',
      role: 'FINANCE_ADMIN',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'target-admin-id' },
      data: { role: 'FINANCE_ADMIN', status: 'ACTIVE' },
    }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.platform-admin.update',
        resourceId: 'target-admin-id',
        metadata: {
          before: { role: 'SUPPORT_ADMIN', status: 'ACTIVE' },
          after: { role: 'FINANCE_ADMIN', status: 'ACTIVE' },
        },
      }),
    }));
  });

  it('prevents demoting the last active Super Admin', async () => {
    const update = jest.fn();
    const tx = {
      platformAdminProfile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'target-admin-id',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          user: { role: 'ADMIN' },
        }),
        count: jest.fn().mockResolvedValue(1),
        update,
      },
    };
    const service = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);

    await expect(service.updatePlatformAdmin('target-admin-id', {
      role: 'FINANCE_ADMIN' as never,
      status: 'ACTIVE' as never,
    }, makeRequest())).rejects.toThrow('last active Super Admin');
    expect(update).not.toHaveBeenCalled();
  });

  it('filters users and writes a sanitized audit record first', async () => {
    const order: string[] = [];
    const prisma = {
      platformAdminAuditLog: {
        create: jest.fn(async ({ data }) => {
          order.push('audit');
          expect(data).toMatchObject({
            actorId: 'admin-id',
            action: 'admin.users.read',
            resourceType: 'user',
            metadata: { page: 2, pageSize: 10, searchApplied: true },
            ipAddress: '192.0.2.9',
            userAgent: 'Test Agent',
          });
          expect(JSON.stringify(data)).not.toContain('private search');
          return { id: 'audit-id' };
        }),
      },
      user: {
        count: jest.fn(async ({ where }) => {
          order.push('count');
          expect(where.OR).toEqual([
            { email: { contains: 'private search', mode: 'insensitive' } },
            { name: { contains: 'private search', mode: 'insensitive' } },
          ]);
          return 21;
        }),
        findMany: jest.fn(async (args) => {
          order.push('find');
          expect(args).toMatchObject({
            skip: 10,
            take: 10,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: expect.objectContaining({ id: true, email: true, name: true }),
          });
          expect(args.select.passwordHash).toBeUndefined();
          return [{
            id: 'user-id',
            email: 'user@example.test',
            name: 'User',
            role: 'USER',
            accountStatus: 'ACTIVE',
            emailVerifiedAt: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            subscription: { plan: 'FREE' },
          }];
        }),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService);
    const result = await service.users(
      { page: 2, pageSize: 10, q: 'private search' },
      makeRequest(),
    );
    expect(order).toEqual(['audit', 'count', 'find']);
    expect(result).toMatchObject({
      items: [{ id: 'user-id', emailVerified: false }],
      page: { page: 2, pageSize: 10, totalItems: 21, totalPages: 3 },
    });
  });

  it('searches businesses with deterministic pagination', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const workspaceCount = jest.fn().mockResolvedValue(0);
    const workspaceFindMany = jest.fn().mockResolvedValue([]);
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      workspace: { count: workspaceCount, findMany: workspaceFindMany },
    } as unknown as PrismaService);

    await service.businesses({ page: 3, pageSize: 5, q: 'studio' }, makeRequest());

    expect(workspaceCount).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'studio', mode: 'insensitive' } },
          { owner: { name: { contains: 'studio', mode: 'insensitive' } } },
          { owner: { email: { contains: 'studio', mode: 'insensitive' } } },
        ],
      },
    });
    expect(workspaceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 5,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });
});

describe('AdminService account governance', () => {
  it('suspends an account, revokes sessions, and audits in one transaction', async () => {
    const calls: string[] = [];
    const tx = {
      user: {
        updateMany: jest.fn(async (args) => {
          calls.push('status');
          expect(args).toEqual({
            where: { id: 'user-id' },
            data: { accountStatus: 'SUSPENDED' },
          });
          return { count: 1 };
        }),
      },
      session: {
        updateMany: jest.fn(async (args) => {
          calls.push('sessions');
          expect(args).toMatchObject({
            where: { userId: 'user-id', revokedAt: null },
            data: { revokedAt: expect.any(Date) },
          });
          return { count: 2 };
        }),
      },
      platformAdminAuditLog: {
        create: jest.fn(async ({ data }) => {
          calls.push('audit');
          expect(data).toMatchObject({
            actorId: 'admin-id',
            action: 'admin.user.suspend',
            resourceType: 'user',
            resourceId: 'user-id',
            metadata: { status: 'SUSPENDED', revokedSessionCount: 2 },
            ipAddress: '192.0.2.9',
          });
          return { id: 'audit-id' };
        }),
      },
    };
    const transaction = jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
    const service = new AdminService({ $transaction: transaction } as unknown as PrismaService);

    await expect(service.setUserStatus('user-id', 'SUSPENDED' as never, makeRequest()))
      .resolves.toEqual({ id: 'user-id', status: 'SUSPENDED', revokedSessionCount: 2 });
    expect(calls).toEqual(['status', 'sessions', 'audit']);
  });

  it('reactivates an account without reactivating old sessions', async () => {
    const sessionUpdate = jest.fn();
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { updateMany: sessionUpdate },
      platformAdminAuditLog: { create: auditCreate },
    };
    const service = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);

    await expect(service.setUserStatus('user-id', 'ACTIVE' as never, makeRequest()))
      .resolves.toEqual({ id: 'user-id', status: 'ACTIVE', revokedSessionCount: 0 });
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.user.reactivate',
        metadata: { status: 'ACTIVE', revokedSessionCount: 0 },
      }),
    }));
  });

  it('denies self-suspension, missing accounts, and un-audited mutations', async () => {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      session: { updateMany: jest.fn() },
      platformAdminAuditLog: { create: jest.fn() },
    };
    const service = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService);
    await expect(service.setUserStatus('admin-id', 'SUSPENDED' as never, makeRequest()))
      .rejects.toThrow('Administrators cannot suspend their own account');
    await expect(service.setUserStatus('missing-user', 'SUSPENDED' as never, makeRequest()))
      .rejects.toThrow('Customer not found');

    const auditFailureService = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({
        user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        platformAdminAuditLog: { create: jest.fn().mockRejectedValue(new Error('audit unavailable')) },
      })),
    } as unknown as PrismaService);
    await expect(auditFailureService.setUserStatus('user-id', 'SUSPENDED' as never, makeRequest()))
      .rejects.toThrow('audit unavailable');
  });

  it('revokes only the target account session and writes audit in the transaction', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const sessionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const service = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({
        session: { updateMany: sessionUpdate },
        platformAdminAuditLog: { create: auditCreate },
      })),
    } as unknown as PrismaService);

    await expect(service.revokeUserSession('user-id', 'session-id', makeRequest()))
      .resolves.toBeUndefined();
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-id', userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.user.session.revoke',
        resourceType: 'session',
        resourceId: 'session-id',
        metadata: { userId: 'user-id' },
      }),
    }));
  });

  it('audits missing session revocations without writing a false success record', async () => {
    const auditCreate = jest.fn();
    const service = new AdminService({
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback({
        session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        platformAdminAuditLog: { create: auditCreate },
      })),
    } as unknown as PrismaService);
    await expect(service.revokeUserSession('user-id', 'missing-session', makeRequest()))
      .rejects.toThrow('Active session not found');
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe('AdminService targeted metadata', () => {
  it('returns selected customer and business metadata only, after auditing each read', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const userFindUnique = jest.fn().mockResolvedValue({
      id: 'user-id',
      email: 'person@example.test',
      name: 'Person',
      role: 'USER',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      subscription: { plan: 'FREE', storageLimitBytes: 10n, storageUsedBytes: 2n, storageReservedBytes: 0n },
      ownedWorkspaces: [{
        id: 'workspace-id',
        name: 'Studio',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        storageLimitBytes: 20n,
        storageUsedBytes: 5n,
        _count: { members: 2, files: 1 },
      }],
      memberships: [],
      _count: { files: 1, events: 0, supportTickets: 0 },
    });
    const workspaceFindUnique = jest.fn().mockResolvedValue({
      id: 'workspace-id',
      name: 'Studio',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      storageLimitBytes: 20n,
      storageUsedBytes: 5n,
      owner: { id: 'user-id', name: 'Person', email: 'person@example.test' },
      members: [],
      _count: { files: 1, folders: 1 },
    });
    const prisma = {
      platformAdminAuditLog: { create: auditCreate },
      user: { findUnique: userFindUnique },
      workspace: { findUnique: workspaceFindUnique },
      storedFile: { aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 7n } }) },
      session: { findMany: jest.fn().mockResolvedValue([{
        id: 'session-id',
        createdAt: new Date('2026-01-03T00:00:00Z'),
        lastSeenAt: new Date('2026-01-04T00:00:00Z'),
        userAgent: 'Browser/1',
        revokedAt: null,
        expiresAt: new Date('2027-01-04T00:00:00Z'),
      }]) },
      paymentAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      supportTicket: { groupBy: jest.fn().mockResolvedValue([]) },
      event: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    const customer = await service.userDetails('user-id', makeRequest());
    expect(customer).toMatchObject({
      id: 'user-id',
      emailVerified: false,
      subscription: {
        plan: 'FREE',
        storageLimitBytes: '10',
        storageUsedBytes: '2',
        storageReservedBytes: '0',
      },
      activity: {
        fileCount: 1,
        eventCount: 0,
        readyFileBytes: '7',
        activeSessionCount: 1,
      },
      activeSessions: [{
        id: 'session-id',
        createdAt: new Date('2026-01-03T00:00:00Z'),
        lastSeenAt: new Date('2026-01-04T00:00:00Z'),
        userAgent: 'Browser/1',
      }],
      paymentHistory: [],
      supportHistory: { total: 0, OPEN: 0, PENDING: 0, RESOLVED: 0 },
      businesses: [{ id: 'workspace-id', fileCount: 1, memberCount: 2 }],
    });
    expect(() => JSON.stringify(customer)).not.toThrow();
    expect(userFindUnique.mock.calls[0][0].select.passwordHash).toBeUndefined();

    const business = await service.businessDetails('workspace-id', makeRequest());
    expect(business).toMatchObject({
      id: 'workspace-id',
      storage: { usedBytes: '5', limitBytes: '20', readyFileBytes: '7' },
      fileCount: 1,
      folderCount: 1,
      eventCount: 2,
    });
    expect(workspaceFindUnique.mock.calls[0][0].select.files).toBeUndefined();
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(
      { customer, business },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    )).not.toContain('objectKey');
  });

  it('audits the customer detail read before returning only active session metadata', async () => {
    const calls: string[] = [];
    const createdAt = new Date('2026-02-01T10:00:00Z');
    const lastSeenAt = new Date('2026-02-02T10:00:00Z');
    const auditCreate = jest.fn(async () => {
      calls.push('audit');
      return { id: 'audit-id' };
    });
    const sessions = [{
      id: 'active-session-id',
      createdAt,
      lastSeenAt,
      userAgent: 'Browser/2',
      tokenHash: 'secret-token-hash',
      ipAddress: '198.51.100.10',
      revokedAt: null,
      expiresAt: new Date('2027-02-02T10:00:00Z'),
    }];
    const sessionFindMany = jest.fn(async (args) => {
      if (args.where.revokedAt === null) {
        calls.push('active-sessions');
        expect(args).toMatchObject({
          where: {
            userId: 'user-id',
            revokedAt: null,
            expiresAt: { gt: expect.any(Date) },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
      } else {
        calls.push('sessions');
        expect(args).toMatchObject({
          where: { userId: 'user-id' },
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
        });
      }
      return sessions;
    });
    const paymentFindMany = jest.fn().mockResolvedValue([]);
    const supportGroupBy = jest.fn().mockResolvedValue([]);
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      user: {
        findUnique: jest.fn(async () => {
          calls.push('customer');
          return {
            id: 'user-id',
            email: 'person@example.test',
            name: 'Person',
            role: 'USER',
            accountStatus: 'ACTIVE',
            emailVerifiedAt: null,
            createdAt,
            subscription: null,
            ownedWorkspaces: [],
            memberships: [],
            _count: { files: 0, events: 0, supportTickets: 0 },
          };
        }),
      },
      storedFile: { aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: null } }) },
      session: { findMany: sessionFindMany },
      paymentAttempt: { findMany: paymentFindMany },
      supportTicket: { groupBy: supportGroupBy },
    } as unknown as PrismaService);

    const request = makeRequest();
    request.platformAdmin.platformAdminProfile.role = 'USER_MANAGEMENT_ADMIN' as never;
    const result = await service.userDetails('user-id', request);

    expect(calls).toEqual(['audit', 'customer', 'active-sessions', 'sessions']);
    expect(result.paymentHistory).toBeNull();
    expect(result.supportHistory).toBeNull();
    expect(paymentFindMany).not.toHaveBeenCalled();
    expect(supportGroupBy).not.toHaveBeenCalled();
    expect(result.activeSessions).toEqual([{
      id: 'active-session-id',
      createdAt,
      lastSeenAt,
      userAgent: 'Browser/2',
    }]);
    expect(result.activity.activeSessionCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('secret-token-hash');
    expect(JSON.stringify(result)).not.toContain('198.51.100.10');
  });
});

describe('AdminService storage inventory', () => {
  it('audits and reports ready-file usage by user, workspace, and MIME type without file metadata', async () => {
    const calls: string[] = [];
    const auditCreate = jest.fn(async () => {
      calls.push('audit');
      return { id: 'audit-id' };
    });
    const userUsage = [{
      userId: 'user-id',
      _sum: { sizeBytes: 800n },
      _count: { _all: 2 },
    }];
    const workspaceUsage = [{
      workspaceId: 'workspace-id',
      _sum: { sizeBytes: 500n },
      _count: { _all: 1 },
    }];
    const mimeUsage = [{
      mimeType: 'image/jpeg',
      _sum: { sizeBytes: 500n },
      _count: { _all: 1 },
    }];
    const groupBy = jest.fn(async (args) => {
      const dimension = args.by[0];
      calls.push(`group:${dimension}`);
      expect(args.where.status).toBe('READY');
      expect(args.take === undefined || args.take === 10).toBe(true);
      if (dimension === 'userId') return userUsage;
      if (dimension === 'workspaceId') {
        expect(args.where.workspaceId).toEqual({ not: null });
        return workspaceUsage;
      }
      return mimeUsage;
    });
    const prisma = {
      platformAdminAuditLog: { create: auditCreate },
      storedFile: {
        aggregate: jest.fn(async (args) => {
          calls.push('summary');
          expect(args.where).toEqual({ status: 'READY' });
          return { _count: { _all: 3 }, _sum: { sizeBytes: 1_000n } };
        }),
        groupBy,
      },
      user: {
        findMany: jest.fn(async (args) => {
          calls.push('users');
          expect(args.select).toEqual({ id: true, name: true, email: true });
          return [{ id: 'user-id', name: 'Person', email: 'person@example.test' }];
        }),
      },
      workspace: {
        findMany: jest.fn(async (args) => {
          calls.push('workspaces');
          expect(args.select.owner).toEqual({ select: { id: true, name: true, email: true } });
          return [{
            id: 'workspace-id',
            name: 'Studio',
            owner: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' },
          }];
        }),
      },
    };
    const service = new AdminService(prisma as unknown as PrismaService);

    const result = await service.storageInventory(makeRequest());

    expect(calls).toEqual([
      'audit',
      'summary',
      'group:userId',
      'group:workspaceId',
      'group:mimeType',
      'users',
      'workspaces',
    ]);
    expect(result).toEqual({
      summary: { readyFileCount: 3, readyBytes: '1000' },
      largestUsers: [{
        userId: 'user-id',
        name: 'Person',
        email: 'person@example.test',
        readyFileCount: 2,
        usedBytes: '800',
      }],
      largestWorkspaces: [{
        workspaceId: 'workspace-id',
        name: 'Studio',
        owner: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' },
        readyFileCount: 1,
        usedBytes: '500',
      }],
      mimeTypes: [{ mimeType: 'image/jpeg', readyFileCount: 1, usedBytes: '500' }],
    });
    expect(JSON.stringify(result)).not.toContain('originalName');
    expect(JSON.stringify(result)).not.toContain('objectKey');
  });
});

describe('AdminService event directory', () => {
  it('audits a paginated directory and returns only persisted event status/date/gallery data', async () => {
    const calls: string[] = [];
    const auditCreate = jest.fn(async ({ data }) => {
      calls.push('audit');
      expect(data).toMatchObject({
        action: 'admin.events.read',
        resourceType: 'event-directory',
        metadata: {
          page: 2,
          pageSize: 5,
          searchApplied: true,
          status: 'ACTIVE',
          gallerySetting: 'PASSCODE',
        },
      });

      return { id: 'audit-id' };
    });
    const eventDate = new Date('2026-03-01T10:00:00Z');
    const createdAt = new Date('2026-02-01T10:00:00Z');
    const where = {
      AND: [
        { name: { contains: 'gala', mode: 'insensitive' } },
        { status: 'ACTIVE' },
        { gallerySetting: 'PASSCODE' },
      ],
    };
    const eventCount = jest.fn(async (args) => {
      calls.push('count');
      expect(args).toEqual({ where });
      return 12;
    });
    const eventFindMany = jest.fn(async (args) => {
      calls.push('find');
      expect(args).toMatchObject({
        where,
        skip: 5,
        take: 5,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          date: true,
          createdAt: true,
          status: true,
          gallerySetting: true,
          owner: { select: { id: true, name: true, email: true } },
          folder: { select: { workspace: { select: { id: true, name: true } } } },
        },
      });
      return [{
        id: 'event-id',
        name: 'Gala',
        date: eventDate,
        createdAt,
        status: 'ACTIVE',
        gallerySetting: 'PASSCODE',
        owner: { id: 'user-id', name: 'Person', email: 'person@example.test' },
        folder: { workspace: { id: 'workspace-id', name: 'Studio' } },
      }];
    });
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      event: { count: eventCount, findMany: eventFindMany },
    } as unknown as PrismaService);

    const result = await service.events({
      page: 2,
      pageSize: 5,
      q: 'gala',
      status: 'ACTIVE' as never,
      gallerySetting: 'PASSCODE' as never,
    }, makeRequest());

    expect(calls).toEqual(['audit', 'count', 'find']);
    expect(result).toEqual({
      items: [{
        id: 'event-id',
        name: 'Gala',
        date: eventDate,
        createdAt,
        status: 'ACTIVE',
        gallerySetting: 'PASSCODE',
        owner: { id: 'user-id', name: 'Person', email: 'person@example.test' },
        workspace: { id: 'workspace-id', name: 'Studio' },
      }],
      page: { page: 2, pageSize: 5, totalItems: 12, totalPages: 3 },
    });
    expect(JSON.stringify(result)).not.toContain('galleryTokenHash');
    expect(JSON.stringify(result)).not.toContain('galleryPasscodeHash');
    expect(JSON.stringify(result)).not.toContain('COMPLETED');
  });
});

describe('AdminService upload monitoring', () => {
  it('returns a paginated, searchable uploader-aware log without storage keys', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const findMany = jest.fn().mockResolvedValue([{
      id: 'file-id',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1200n,
      status: 'READY',
      uploadSource: 'STANDARD',
      createdAt: new Date('2026-03-01T10:00:00Z'),
      eventId: null,
      user: { id: 'user-id', name: 'Customer', email: 'customer@example.test' },
      workspace: { id: 'workspace-id', name: 'Studio' },
      event: null,
    }]);
    const storedFile = {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { sizeBytes: null },
      }),
      count: jest.fn().mockResolvedValue(1),
      findMany,
    };
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      storedFile,
    } as unknown as PrismaService);

    const result = await service.uploadMonitoring(
      { page: 2, pageSize: 5, q: 'report' },
      makeRequest(),
    );

    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'admin.upload-monitoring.read',
        resourceType: 'stored-file',
        metadata: { metadataOnly: true, page: 2, pageSize: 5, searchApplied: true },
      }),
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { originalName: { contains: 'report', mode: 'insensitive' } },
          { event: { is: { name: { contains: 'report', mode: 'insensitive' } } } },
        ]),
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    }));
    expect(result.uploads).toEqual({
      items: [{
        id: 'file-id',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1200',
        status: 'READY',
        uploadSource: 'STANDARD',
        createdAt: new Date('2026-03-01T10:00:00Z'),
        uploader: { id: 'user-id', name: 'Customer', email: 'customer@example.test' },
        workspace: { id: 'workspace-id', name: 'Studio' },
        event: null,
      }],
      page: { page: 2, pageSize: 5, totalItems: 1, totalPages: 1 },
    });
    expect(JSON.stringify(result.uploads)).not.toContain('objectKey');
  });
});

describe('AdminService analytics', () => {
  it('audits range queries and reports UTC customer registrations and persisted plan distribution only', async () => {
    const calls: string[] = [];
    const auditCreate = jest.fn(async ({ data }) => {
      calls.push('audit');
      expect(data).toMatchObject({
        action: 'admin.analytics.read',
        resourceType: 'analytics',
        metadata: {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-03T00:00:00.000Z',
          rangeEndExclusive: true,
        },
      });
      return { id: 'audit-id' };
    });
    const rawQuery = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push('registrations');
      expect(strings.join(' ')).toContain('"role" =');
      expect(strings.join(' ')).toContain('date_trunc');
      expect(values).toContain('USER');
      expect(values).toContainEqual(new Date('2026-01-01T00:00:00Z'));
      expect(values).toContainEqual(new Date('2026-01-03T00:00:00Z'));
      return [{ day: new Date('2026-01-01T00:00:00Z'), count: 2 }];
    });
    const subscriptionGroupBy = jest.fn(async () => {
      calls.push('subscriptions');
      return [
        { plan: 'FREE', _count: { _all: 2 } },
        { plan: 'BUSINESS', _count: { _all: 1 } },
      ];
    });
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      $queryRaw: rawQuery,
      subscription: { groupBy: subscriptionGroupBy },
    } as unknown as PrismaService);

    const result = await service.analytics({
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-03T00:00:00Z',
    }, makeRequest());

    expect(calls).toEqual(['audit', 'registrations', 'subscriptions']);
    expect(result).toEqual({
      range: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-03T00:00:00.000Z',
        endExclusive: true,
        timezone: 'UTC',
      },
      registrationsByDay: [
        { day: '2026-01-01', count: 2 },
        { day: '2026-01-02', count: 0 },
      ],
      subscriptionDistribution: [
        { plan: 'FREE', count: 2 },
        { plan: 'PRO', count: 0 },
        { plan: 'BUSINESS', count: 1 },
      ],
      notComputed: ['MRR', 'DAU', 'churn'],
    });
  });

  describe('AdminService plan catalogue administration', () => {
    const currentPlan = {
      plan: 'PRO',
      staffLimit: 10,
      activeEventLimit: 10,
      storageLimitBytes: 15_000n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
      monthlyPriceMinor: 500_000n,
      currency: 'NGN',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    const input = {
      staffLimit: 12,
      activeEventLimit: 11,
      storageLimitBytes: '20000',
      canEditDocuments: true,
      canScanDocuments: false,
      advancedTeamManagement: true,
      monthlyPriceMinor: '750000',
    };

    it('audits plan reads before querying persisted plan settings', async () => {
      const calls: string[] = [];
      const auditCreate = jest.fn(async () => {
        calls.push('audit');
        return { id: 'audit-id' };
      });
      const findMany = jest.fn(async () => {
        calls.push('plans');
        return [
          {
            ...currentPlan,
            plan: 'FREE',
            staffLimit: 3,
            activeEventLimit: 3,
            storageLimitBytes: 5_000n,
            canEditDocuments: false,
            canScanDocuments: false,
            advancedTeamManagement: false,
            monthlyPriceMinor: 0n,
          },
          currentPlan,
          {
            ...currentPlan,
            plan: 'BUSINESS',
            staffLimit: 30,
            activeEventLimit: 20,
            storageLimitBytes: 25_000n,
            advancedTeamManagement: true,
            monthlyPriceMinor: 1_500_000n,
          },
        ];
      });
      const service = new AdminService({
        platformAdminAuditLog: { create: auditCreate },
        planCatalogue: { findMany },
      } as unknown as PrismaService);

      const result = await service.plans(makeRequest());
      expect(result.plans).toHaveLength(3);
      expect(result.plans[1]).toEqual({
        plan: 'PRO',
        name: 'Pro',
        currency: 'NGN',
        monthlyPriceMinor: '500000',
        limits: {
          staffLimit: 10,
          activeEventLimit: 10,
          storageLimitBytes: '15000',
          maxUploadBytes: String(250 * 1024 * 1024),
        },
        features: {
          canEditDocuments: true,
          canScanDocuments: true,
          advancedTeamManagement: false,
        },
        updatedAt: currentPlan.updatedAt,
      });
      expect(calls).toEqual(['audit', 'plans']);
    });

    it('updates the plan, synchronizes existing storage caps, and audits atomically', async () => {
      const calls: string[] = [];
      const updatedPlan = {
        ...currentPlan,
        staffLimit: input.staffLimit,
        activeEventLimit: input.activeEventLimit,
        storageLimitBytes: 20_000n,
        canScanDocuments: input.canScanDocuments,
        advancedTeamManagement: input.advancedTeamManagement,
        monthlyPriceMinor: 750_000n,
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      };
      const auditCreate = jest.fn(async ({ data }) => {
        calls.push('audit');
        expect(data).toMatchObject({
          action: 'admin.plan-catalogue.update',
          resourceType: 'plan-catalogue',
          resourceId: 'PRO',
          metadata: {
            before: {
              storageLimitBytes: '15000',
              monthlyPriceMinor: '500000',
              currency: 'NGN',
            },
            after: {
              storageLimitBytes: '20000',
              monthlyPriceMinor: '750000',
              currency: 'NGN',
            },
            synchronizedSubscriptionCount: 2,
            synchronizedWorkspaceCount: 3,
          },
        });
        return { id: 'audit-id' };
      });
      const tx = {
        planCatalogue: {
          findUnique: jest.fn(async () => {
            calls.push('find-plan');
            return currentPlan;
          }),
          update: jest.fn(async (args) => {
            calls.push('update-plan');
            expect(args).toEqual({
              where: { plan: 'PRO' },
              data: {
                staffLimit: 12,
                activeEventLimit: 11,
                storageLimitBytes: 20_000n,
                canEditDocuments: true,
                canScanDocuments: false,
                advancedTeamManagement: true,
                monthlyPriceMinor: 750_000n,
              },
            });
            return updatedPlan;
          }),
        },
        subscription: {
          findMany: jest.fn(async () => {
            calls.push('find-subscribers');
            return [{ userId: 'user-1' }, { userId: 'user-2' }];
          }),
          updateMany: jest.fn(async (args) => {
            calls.push('sync-subscriptions');
            expect(args).toEqual({
              where: { plan: 'PRO' },
              data: { storageLimitBytes: 20_000n },
            });
            return { count: 2 };
          }),
        },
        workspace: {
          updateMany: jest.fn(async (args) => {
            calls.push('sync-workspaces');
            expect(args).toEqual({
              where: { ownerUserId: { in: ['user-1', 'user-2'] } },
              data: { storageLimitBytes: 20_000n },
            });
            return { count: 3 };
          }),
        },
        platformAdminAuditLog: { create: auditCreate },
      };
      const transaction = jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
      const service = new AdminService({ $transaction: transaction } as unknown as PrismaService);

      await expect(service.updatePlan('PRO' as never, input as never, makeRequest()))
        .resolves.toMatchObject({
          plan: 'PRO',
          monthlyPriceMinor: '750000',
          limits: { staffLimit: 12, activeEventLimit: 11, storageLimitBytes: '20000' },
        });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([
        'find-plan',
        'update-plan',
        'find-subscribers',
        'sync-subscriptions',
        'sync-workspaces',
        'audit',
      ]);
    });

    it('rejects int64 overflow before opening a mutation transaction', async () => {
      const transaction = jest.fn();
      const service = new AdminService({ $transaction: transaction } as unknown as PrismaService);
      await expect(service.updatePlan('PRO' as never, {
        ...input,
        monthlyPriceMinor: '9223372036854775808',
      } as never, makeRequest())).rejects.toThrow('signed 64-bit integer');
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  it('rejects reversed and overlong analytics ranges before querying data', async () => {
    const auditCreate = jest.fn();
    const rawQuery = jest.fn();
    const service = new AdminService({
      platformAdminAuditLog: { create: auditCreate },
      $queryRaw: rawQuery,
      subscription: { groupBy: jest.fn() },
    } as unknown as PrismaService);

    await expect(service.analytics({
      from: '2026-02-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }, makeRequest())).rejects.toThrow('Analytics range must have from before to');
    await expect(service.analytics({
      from: '2024-01-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }, makeRequest())).rejects.toThrow('Analytics range must have from before to');
    expect(auditCreate).not.toHaveBeenCalled();
    expect(rawQuery).not.toHaveBeenCalled();
  });
});
