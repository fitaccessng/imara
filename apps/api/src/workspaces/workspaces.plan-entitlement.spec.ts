jest.mock('@nestjs/common', () => {
  class MockConflictException extends Error {}
  return {
    ConflictException: MockConflictException,
    Injectable: () => (target: unknown) => target,
  };
});

import { ConflictException } from '@nestjs/common';
import { WorkspaceRole, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../auth/mailer.service';
import { WorkspacesService } from './workspaces.service';

describe('WorkspacesService persisted plan limits', () => {
  it('counts active members and pending invites against the current catalogue staff limit', async () => {
    const tx = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ plan: 'PRO' }),
      },
      workspaceMember: { count: jest.fn().mockResolvedValue(1) },
      workspaceInvitation: { count: jest.fn().mockResolvedValue(1) },
    };
    const getEntitlements = jest.fn().mockResolvedValue({
      staffLimit: 2,
      activeEventLimit: 10,
      storageLimitBytes: 15_000n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
    });
    const currentPlan = jest.fn(async (subscription: { plan: string }) => subscription.plan);
    const service = new WorkspacesService(
      {} as PrismaService,
      {} as MailerService,
      { getEntitlements, currentPlan } as never,
    );
    const assertCapacity = (
      service as unknown as {
        assertStaffCapacity(
          transaction: Prisma.TransactionClient,
          workspaceId: string,
          ownerUserId: string,
        ): Promise<void>;
      }
    ).assertStaffCapacity.bind(service);

    await expect(assertCapacity(tx as never, 'workspace-id', 'owner-id'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(getEntitlements).toHaveBeenCalledWith('PRO', tx);
  });

  it('uses the advanced-team catalogue feature when assigning the manager role', async () => {
    const tx = {
      subscription: { findUnique: jest.fn().mockResolvedValue({ plan: 'PRO' }) },
    };
    const requireAdvancedTeamManagement = jest.fn().mockResolvedValue(undefined);
    const currentPlan = jest.fn(async (subscription: { plan: string }) => subscription.plan);
    const service = new WorkspacesService(
      {} as PrismaService,
      {} as MailerService,
      { requireAdvancedTeamManagement, currentPlan } as never,
    );
    const assertManagerRoleAvailable = (
      service as unknown as {
        assertManagerRoleAvailable(
          transaction: Prisma.TransactionClient,
          ownerUserId: string,
          role: WorkspaceRole,
        ): Promise<void>;
      }
    ).assertManagerRoleAvailable.bind(service);

    await assertManagerRoleAvailable(tx as never, 'owner-id', WorkspaceRole.STAFF);
    expect(requireAdvancedTeamManagement).not.toHaveBeenCalled();
    await assertManagerRoleAvailable(tx as never, 'owner-id', WorkspaceRole.MANAGER);
    expect(requireAdvancedTeamManagement).toHaveBeenCalledWith('PRO', tx);
  });
});
