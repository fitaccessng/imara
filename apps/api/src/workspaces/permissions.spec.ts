jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';
import { evaluateFolderPermission } from './permissions';

describe('folder permission evaluation', () => {
  const path = [{ id: 'root' }, { id: 'department' }, { id: 'payroll' }];

  it('inherits grants recursively only when inheritance is enabled', () => {
    expect(evaluateFolderPermission('STAFF', 'viewFiles', path, [{
      folderId: 'root', effect: 'GRANT', permissionKeys: ['viewFiles'], inherit: true,
    }])).toBe(true);
    expect(evaluateFolderPermission('STAFF', 'viewFiles', path, [{
      folderId: 'root', effect: 'GRANT', permissionKeys: ['viewFiles'], inherit: false,
    }])).toBe(false);
  });

  it('applies explicit restrictions to an inherited parent grant and its subtree', () => {
    const rules = [
      { folderId: 'root', effect: 'GRANT' as const, permissionKeys: ['downloadFiles'], inherit: true },
      { folderId: 'department', effect: 'RESTRICT' as const, permissionKeys: ['downloadFiles'], inherit: true },
    ];
    expect(evaluateFolderPermission('STAFF', 'downloadFiles', path, rules)).toBe(false);
    expect(evaluateFolderPermission('STAFF', 'downloadFiles', path.slice(0, 2), rules)).toBe(false);
  });

  it('allows a deliberate descendant grant to re-grant a restricted permission', () => {
    const rules = [
      { folderId: 'root', effect: 'GRANT' as const, permissionKeys: ['uploadFiles'], inherit: true },
      { folderId: 'department', effect: 'RESTRICT' as const, permissionKeys: ['uploadFiles'], inherit: true },
      { folderId: 'payroll', effect: 'GRANT' as const, permissionKeys: ['uploadFiles'], inherit: false },
    ];
    expect(evaluateFolderPermission('MANAGER', 'uploadFiles', path, rules)).toBe(true);
  });

  it('gives owner and administrator full folder access independent of staff rules', () => {
    expect(evaluateFolderPermission('OWNER', 'downloadFiles', path, [])).toBe(true);
    expect(evaluateFolderPermission('ADMIN', 'managePermissions', path, [])).toBe(true);
    expect(evaluateFolderPermission('STAFF', 'downloadFiles', path, [])).toBe(false);
  });

  it('keeps permissions action-specific', () => {
    const rules = [{ folderId: 'root', effect: 'GRANT' as const, permissionKeys: ['editFiles'], inherit: true }];
    expect(evaluateFolderPermission('STAFF', 'editFiles', path, rules)).toBe(true);
    expect(evaluateFolderPermission('STAFF', 'downloadFiles', path, rules)).toBe(false);
  });
});

describe('workspace folder authorization', () => {
  const membershipFindFirst = jest.fn();
  const membershipFindMany = jest.fn();
  const folderFindFirst = jest.fn();
  const permissionsFindMany = jest.fn();
  const service = new WorkspacesService({
    workspaceMember: { findFirst: membershipFindFirst, findMany: membershipFindMany },
    folder: { findFirst: folderFindFirst },
    folderPermission: { findMany: permissionsFindMany },
  } as unknown as PrismaService, {} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('denies suspended members before resolving any folder permissions', async () => {
    membershipFindFirst.mockResolvedValue(null);
    await expect(service.authorizeFolder('workspace-a', 'user-a', 'folder-a', 'viewFiles'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(folderFindFirst).not.toHaveBeenCalled();
    expect(permissionsFindMany).not.toHaveBeenCalled();
  });

  it('scopes folder lookup to the requested workspace and denies unassigned folders', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'member-a', userId: 'user-a', workspaceId: 'workspace-a', role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.ACTIVE, workspace: { id: 'workspace-a', name: 'A', ownerUserId: 'owner-a' },
    });
    folderFindFirst.mockResolvedValue({ id: 'folder-a', parentFolderId: null, workspaceId: 'workspace-a' });
    permissionsFindMany.mockResolvedValue([]);

    await expect(service.authorizeFolder('workspace-a', 'user-a', 'folder-a', 'viewFiles'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(folderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'folder-a', workspaceId: 'workspace-a' },
    }));
    expect(permissionsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'workspace-a', memberId: 'member-a', folderId: { in: ['folder-a'] } }),
    }));
  });

  it('loads permission rules only for the requesting member, not another employee', async () => {
    membershipFindFirst.mockImplementation(async ({ where }: { where: { userId: string } }) => ({
      id: `member-${where.userId}`, userId: where.userId, workspaceId: 'workspace-a',
      role: WorkspaceRole.STAFF, status: WorkspaceMemberStatus.ACTIVE,
      workspace: { id: 'workspace-a', name: 'A', ownerUserId: 'owner-a' },
    }));
    folderFindFirst.mockResolvedValue({ id: 'folder-a', parentFolderId: null, workspaceId: 'workspace-a' });
    permissionsFindMany.mockImplementation(async ({ where }: { where: { memberId: string } }) =>
      where.memberId === 'member-user-a'
        ? [{ folderId: 'folder-a', effect: 'GRANT', permissionKeys: ['viewFiles'], inherit: true }]
        : []);

    await expect(service.authorizeFolder('workspace-a', 'user-a', 'folder-a', 'viewFiles')).resolves.toBeDefined();
    await expect(service.authorizeFolder('workspace-a', 'user-b', 'folder-a', 'viewFiles'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not resolve a folder belonging to another workspace', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'member-a', userId: 'user-a', workspaceId: 'workspace-a', role: WorkspaceRole.OWNER,
      status: WorkspaceMemberStatus.ACTIVE, workspace: { id: 'workspace-a', name: 'A', ownerUserId: 'user-a' },
    });
    folderFindFirst.mockResolvedValue(null);
    await expect(service.authorizeFolder('workspace-a', 'user-a', 'business-b-folder', 'viewFolder'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(folderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'business-b-folder', workspaceId: 'workspace-a' },
    }));
  });

  it('treats the workspace creator as active owner despite a stale member role or status', async () => {
    membershipFindFirst.mockResolvedValue({
      id: 'member-owner', userId: 'owner-a', workspaceId: 'workspace-a', role: WorkspaceRole.STAFF,
      status: WorkspaceMemberStatus.SUSPENDED,
      workspace: { id: 'workspace-a', name: 'A', ownerUserId: 'owner-a' },
    });
    folderFindFirst.mockResolvedValue({ id: 'folder-a', parentFolderId: null, workspaceId: 'workspace-a' });

    await expect(service.authorizeFolder('workspace-a', 'owner-a', 'folder-a', 'createSubfolders'))
      .resolves.toMatchObject({
        member: { role: WorkspaceRole.OWNER, status: WorkspaceMemberStatus.ACTIVE },
      });
  });

  it('lists the workspace creator as owner regardless of the stored membership role', async () => {
    membershipFindMany.mockResolvedValue([{
      role: WorkspaceRole.STAFF,
      joinedAt: new Date('2026-01-01T00:00:00Z'),
      workspace: {
        id: 'workspace-a', name: 'A', createdAt: new Date('2026-01-01T00:00:00Z'),
        ownerUserId: 'owner-a',
      },
    }]);

    await expect(service.listWorkspaces('owner-a')).resolves.toMatchObject([
      { id: 'workspace-a', role: WorkspaceRole.OWNER },
    ]);
  });

  it('prevents removing the creator even when their stored role is not owner', async () => {
    membershipFindFirst
      .mockResolvedValueOnce({
        id: 'member-admin', userId: 'admin-a', workspaceId: 'workspace-a', role: WorkspaceRole.ADMIN,
        status: WorkspaceMemberStatus.ACTIVE,
        workspace: { id: 'workspace-a', name: 'A', ownerUserId: 'owner-a' },
      })
      .mockResolvedValueOnce({
        id: 'member-owner', userId: 'owner-a', workspaceId: 'workspace-a', role: WorkspaceRole.STAFF,
        status: WorkspaceMemberStatus.ACTIVE,
        workspace: { ownerUserId: 'owner-a' },
      });

    await expect(service.removeMember('workspace-a', 'member-owner', 'admin-a'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
