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

import { ForbiddenException } from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';

describe('workspace staff administration endpoints', () => {
  const memberFindFirst = jest.fn();
  const targetFindFirst = jest.fn();
  const memberLookup = jest.fn((query: { where: { id?: string } }) =>
    query.where.id ? targetFindFirst(query) : memberFindFirst(query));
  const folderFindMany = jest.fn();
  const folderFindFirst = jest.fn();
  const permissionUpsert = jest.fn();
  const auditFindMany = jest.fn();
  const auditCreate = jest.fn();
  const memberUpdate = jest.fn();
  const notificationCreate = jest.fn();
  const workspaceFindUnique = jest.fn();
  const transaction = jest.fn();
  const service = new WorkspacesService({
    workspaceMember: { findFirst: memberLookup, update: memberUpdate },
    folder: { findMany: folderFindMany, findFirst: folderFindFirst },
    folderPermission: { upsert: permissionUpsert },
    workspace: { findUnique: workspaceFindUnique },
    auditLog: { findMany: auditFindMany },
    notification: { create: notificationCreate },
    $transaction: transaction,
  } as never, {} as never, {} as never);

  const admin = {
    id: 'admin-member',
    workspaceId: 'workspace-a',
    userId: 'owner-a',
    role: WorkspaceRole.OWNER,
    status: WorkspaceMemberStatus.ACTIVE,
    workspace: { id: 'workspace-a', ownerUserId: 'owner-a' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindFirst.mockResolvedValue(admin);
    folderFindMany.mockResolvedValue([]);
  });

  it('exposes staff detail only after workspace-admin authorization', async () => {
    targetFindFirst.mockResolvedValue({
      id: 'staff-member',
      role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.ACTIVE,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      displayName: 'Staff',
      user: { id: 'staff-user', email: 'staff@example.com', name: 'Staff User' },
      workspace: { ownerUserId: 'owner-a' },
      _count: { permissions: 1 },
      permissions: [{
        folderId: 'folder-a',
        effect: 'GRANT',
        permissionKeys: ['viewFolder'],
        inherit: true,
      }],
    });
    await expect(service.getMember('workspace-a', 'staff-member', 'owner-a')).resolves.toMatchObject({
      id: 'staff-member',
      role: WorkspaceRole.STAFF,
      user: { email: 'staff@example.com' },
      accessibleFolderCount: 0,
    });
    expect(targetFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'workspace-a', id: 'staff-member' }),
    }));

    memberFindFirst.mockResolvedValue({ ...admin, role: WorkspaceRole.STAFF });
    await expect(service.getMember('workspace-a', 'staff-member', 'staff-user'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exposes workspace audit activity only to workspace administrators', async () => {
    auditFindMany.mockResolvedValue([{ id: 'audit-a', action: 'MEMBER_ROLE_CHANGED' }]);
    await expect(service.activity('workspace-a', 'owner-a')).resolves.toEqual([
      { id: 'audit-a', action: 'MEMBER_ROLE_CHANGED' },
    ]);
    expect(auditFindMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-a' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });

    memberFindFirst.mockResolvedValue({ ...admin, role: WorkspaceRole.STAFF });
    await expect(service.activity('workspace-a', 'staff-user'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the latest activity matching a member after workspace-admin authorization', async () => {
    targetFindFirst.mockResolvedValue({ id: 'staff-member', userId: 'staff-user' });
    auditFindMany.mockResolvedValue([{ id: 'audit-a', action: 'MEMBER_ROLE_CHANGED' }]);
    await expect(service.memberActivity('workspace-a', 'staff-member', 'owner-a')).resolves.toEqual([
      { id: 'audit-a', action: 'MEMBER_ROLE_CHANGED' },
    ]);
    expect(auditFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        OR: [
          { actorId: 'staff-user' },
          { targetId: 'staff-member' },
          { targetId: 'staff-user' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });

    memberFindFirst.mockResolvedValue({ ...admin, role: WorkspaceRole.STAFF });
    await expect(service.memberActivity('workspace-a', 'staff-member', 'staff-user'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('commits role changes and audit events atomically', async () => {
    const target = {
      id: 'staff-member',
      userId: 'staff-user',
      role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.ACTIVE,
      workspace: { ownerUserId: 'owner-a' },
    };
    targetFindFirst.mockResolvedValue(target);
    memberUpdate.mockResolvedValue({ ...target, role: WorkspaceRole.ADMIN, displayName: null });
    notificationCreate.mockResolvedValue({ id: 'notification-a' });
    workspaceFindUnique.mockResolvedValue({ ownerUserId: 'owner-a' });
    auditCreate.mockResolvedValue({ id: 'audit-a' });
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      workspaceMember: { update: memberUpdate },
      auditLog: { create: auditCreate },
    }));
    await expect(service.updateMember('workspace-a', 'staff-member', 'owner-a', WorkspaceRole.ADMIN))
      .resolves.toMatchObject({ role: WorkspaceRole.ADMIN });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        actorId: 'owner-a',
        action: 'MEMBER_ROLE_CHANGED',
        targetType: 'WorkspaceMember',
        targetId: 'staff-member',
        metadata: { from: WorkspaceRole.STAFF, to: WorkspaceRole.ADMIN },
      }),
    });
  });

  it('lets workspace administrators restrict access on a specific descendant and audits the change', async () => {
    const target = {
      id: 'staff-member',
      userId: 'staff-user',
      role: WorkspaceRole.STAFF,
      workspace: { ownerUserId: 'owner-a' },
    };
    targetFindFirst.mockResolvedValue(target);
    folderFindFirst
      .mockResolvedValueOnce({ id: 'child-folder', parentFolderId: 'root-folder', workspaceId: 'workspace-a' })
      .mockResolvedValueOnce({ id: 'root-folder', parentFolderId: null, workspaceId: 'workspace-a' });
    const permission = {
      id: 'permission-a',
      workspaceId: 'workspace-a',
      folderId: 'child-folder',
      memberId: 'staff-member',
      effect: 'RESTRICT',
      permissionKeys: ['downloadFiles'],
      inherit: true,
    };
    permissionUpsert.mockResolvedValue(permission);
    auditCreate.mockResolvedValue({ id: 'audit-a' });
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      folderPermission: { upsert: permissionUpsert },
      auditLog: { create: auditCreate },
    }));
    notificationCreate.mockResolvedValue({ id: 'notification-a' });
    workspaceFindUnique.mockResolvedValue({ ownerUserId: 'owner-a' });

    await expect(service.setFolderPermission('workspace-a', 'child-folder', 'owner-a', {
      memberId: 'staff-member',
      effect: 'RESTRICT',
      permissionKeys: ['downloadFiles'],
      inherit: true,
    })).resolves.toEqual(permission);

    expect(permissionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        workspaceId_folderId_memberId_effect: {
          workspaceId: 'workspace-a',
          folderId: 'child-folder',
          memberId: 'staff-member',
          effect: 'RESTRICT',
        },
      },
    }));
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        actorId: 'owner-a',
        action: 'FOLDER_ACCESS_RESTRICTED',
        targetType: 'FolderPermission',
        targetId: 'permission-a',
      }),
    });

    memberFindFirst.mockResolvedValue({ ...admin, role: WorkspaceRole.STAFF });
    await expect(service.setFolderPermission('workspace-a', 'child-folder', 'staff-user', {
      memberId: 'staff-member',
      effect: 'RESTRICT',
      permissionKeys: ['downloadFiles'],
      inherit: true,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
