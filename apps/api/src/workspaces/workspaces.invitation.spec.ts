jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    Injectable: () => (target: unknown) => target,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { FolderPermissionEffect, InvitationStatus, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../auth/mailer.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { hashToken } from '../auth/token';

describe('workspace invitation acceptance', () => {
  const userFindUnique = jest.fn();
  const invitationFindMany = jest.fn();
  const invitationFindUnique = jest.fn();
  const userFindInTransaction = jest.fn();
  const memberFindUnique = jest.fn();
  const memberCreate = jest.fn();
  const folderFindFirst = jest.fn();
  const permissionCreate = jest.fn();
  const invitationUpdateMany = jest.fn();
  const auditCreate = jest.fn();
  const notificationCreate = jest.fn();
  const workspaceFindUniqueOrThrow = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    workspaceInvitation: { findMany: invitationFindMany, findUnique: invitationFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new WorkspacesService(
    prisma,
    {} as MailerService,
    {} as PlanCatalogueService,
  );
  const rawToken = 'a'.repeat(48);
  const tokenHash = hashToken(rawToken);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('only auto-accepts one live invitation after the account email is verified', async () => {
    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      emailVerifiedAt: new Date(),
    });
    invitationFindMany.mockResolvedValue([{ tokenHash }]);
    const accept = jest.spyOn(service as any, 'acceptInvitationByHash').mockResolvedValue({
      workspaceId: 'workspace-id',
    });

    await expect(service.acceptPendingInvitationForUser('user-id')).resolves.toEqual({
      workspaceId: 'workspace-id',
    });
    expect(invitationFindMany).toHaveBeenCalledWith({
      where: {
        email: 'person@example.com',
        status: InvitationStatus.PENDING,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { tokenHash: true },
      take: 2,
    });
    expect(accept).toHaveBeenCalledWith('user-id', tokenHash);

    userFindUnique.mockResolvedValue({ id: 'user-id', email: 'person@example.com', emailVerifiedAt: null });
    await expect(service.acceptPendingInvitationForUser('user-id')).resolves.toBeNull();
    expect(invitationFindMany).toHaveBeenCalledTimes(1);

    userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      emailVerifiedAt: new Date(),
    });
    invitationFindMany.mockResolvedValue([{ tokenHash }, { tokenHash: 'another-hash' }]);
    await expect(service.acceptPendingInvitationForUser('user-id')).resolves.toBeNull();
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('adds a matching account with the invitation role and initial folder permissions', async () => {
    const invitation = {
      id: 'invitation-id',
      workspaceId: 'workspace-id',
      email: 'person@example.com',
      name: 'Invited Person',
      role: WorkspaceRole.STAFF,
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      initialPermissions: [{
        folderId: 'folder-id',
        permissionKeys: ['viewFolder', 'uploadFile'],
        inherit: true,
      }],
      invitedById: 'owner-id',
    };
    const member = { id: 'member-id', role: WorkspaceRole.STAFF };
    const tx = {
      workspaceInvitation: {
        findUnique: invitationFindUnique,
        updateMany: invitationUpdateMany,
      },
      user: { findUnique: userFindInTransaction },
      workspace: { findUniqueOrThrow: workspaceFindUniqueOrThrow },
      workspaceMember: { findUnique: memberFindUnique, create: memberCreate },
      folder: { findFirst: folderFindFirst },
      folderPermission: { create: permissionCreate },
      auditLog: { create: auditCreate },
      notification: { create: notificationCreate },
    };
    invitationFindUnique.mockResolvedValue(invitation);
    userFindInTransaction.mockResolvedValue({ id: 'user-id', email: 'person@example.com' });
    workspaceFindUniqueOrThrow.mockResolvedValue({ ownerUserId: 'owner-id', name: 'Team' });
    memberFindUnique.mockResolvedValue(null);
    memberCreate.mockResolvedValue(member);
    folderFindFirst.mockResolvedValue({ id: 'folder-id' });
    permissionCreate.mockResolvedValue({});
    invitationUpdateMany.mockResolvedValue({ count: 1 });
    transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    jest.spyOn(service as any, 'assertManagerRoleAvailable').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'assertStaffCapacity').mockResolvedValue(undefined);

    await expect(service.acceptInvitation('user-id', rawToken)).resolves.toEqual({
      workspaceId: 'workspace-id',
      memberId: 'member-id',
      role: WorkspaceRole.STAFF,
    });

    expect(userFindInTransaction).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: { id: true, email: true },
    });
    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-id',
        userId: 'user-id',
        role: WorkspaceRole.STAFF,
        status: WorkspaceMemberStatus.ACTIVE,
        displayName: 'Invited Person',
      },
    });
    expect(permissionCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-id',
        folderId: 'folder-id',
        memberId: 'member-id',
        effect: FolderPermissionEffect.GRANT,
        permissionKeys: ['viewFolder', 'uploadFile'],
        inherit: true,
        createdById: 'owner-id',
        updatedById: 'owner-id',
      },
    });
    expect(invitationUpdateMany).toHaveBeenCalledWith({
      where: { id: 'invitation-id', status: InvitationStatus.PENDING, tokenHash },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: expect.any(Date) },
    });
  });

  it('keeps bearer-token acceptance bound to the exact invited email', async () => {
    invitationFindUnique.mockResolvedValue({
      id: 'invitation-id',
      workspaceId: 'workspace-id',
      email: 'person@example.com',
      status: InvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
    });
    userFindInTransaction.mockResolvedValue({ id: 'user-id', email: 'someone-else@example.com' });
    transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({
      workspaceInvitation: { findUnique: invitationFindUnique },
      user: { findUnique: userFindInTransaction },
    }));

    await expect(service.acceptInvitation('user-id', rawToken))
      .rejects.toThrow('Sign in with the email address that received this invitation');
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('lets the invited account repeat acceptance after verification already auto-accepted it', async () => {
    invitationFindUnique.mockResolvedValue({
      id: 'invitation-id',
      workspaceId: 'workspace-id',
      email: 'person@example.com',
      status: InvitationStatus.ACCEPTED,
    });
    userFindInTransaction.mockResolvedValue({ id: 'user-id', email: 'person@example.com' });
    memberFindUnique.mockResolvedValue({
      id: 'member-id',
      role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.ACTIVE,
    });
    transaction.mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => callback({
      workspaceInvitation: { findUnique: invitationFindUnique },
      user: { findUnique: userFindInTransaction },
      workspaceMember: { findUnique: memberFindUnique },
    }));

    await expect(service.acceptInvitation('user-id', rawToken)).resolves.toEqual({
      workspaceId: 'workspace-id',
      memberId: 'member-id',
      role: WorkspaceRole.STAFF,
    });
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
