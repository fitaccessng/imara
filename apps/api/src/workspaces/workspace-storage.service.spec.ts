jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    Logger: class { error() {} },
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    NotFoundException: MockHttpException,
    PayloadTooLargeException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceStorageService } from './workspace-storage.service';

describe('workspace storage authorization', () => {
  const folderFindMany = jest.fn();
  const folderCreate = jest.fn();
  const memberFindMany = jest.fn();
  const permissionCreateMany = jest.fn();
  const notificationCreateMany = jest.fn();
  const auditLogCreate = jest.fn();
  const fileFindMany = jest.fn();
  const fileFindFirst = jest.fn();
  const getObject = jest.fn();
  const authorizeWorkspace = jest.fn();
  const authorizeFolder = jest.fn();
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    folder: { create: folderCreate },
    workspaceMember: { findMany: memberFindMany },
    folderPermission: { createMany: permissionCreateMany },
    notification: { createMany: notificationCreateMany },
    auditLog: { create: auditLogCreate },
  }));

  const service = new WorkspaceStorageService(
    {
      folder: { findMany: folderFindMany, create: folderCreate },
      storedFile: { findMany: fileFindMany, findFirst: fileFindFirst },
      auditLog: { create: auditLogCreate },
      $transaction: transaction,
    } as unknown as PrismaService,
    { get: getObject } as unknown as ObjectStorageService,
    { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('omits inaccessible folders from a workspace listing', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    folderFindMany.mockResolvedValue([{ id: 'secret-folder', name: 'Payroll', parentFolderId: null }]);
    authorizeFolder.mockRejectedValue(new NotFoundException());

    await expect(service.list('workspace-a', 'staff-a')).resolves.toEqual({
      workspaceId: 'workspace-a',
      folderId: null,
      folders: [],
      files: [],
    });

    expect(fileFindMany).not.toHaveBeenCalled();
  });

  it('lists unindexed files only from folders where the member can download files', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    folderFindMany.mockResolvedValue([{ id: 'download-folder' }, { id: 'view-only-folder' }]);
    authorizeFolder.mockImplementation(async (_workspaceId: string, _userId: string, folderId: string, permission: string) => {
      if (folderId !== 'download-folder' || permission !== 'downloadFiles') throw new NotFoundException();
      return {};
    });
    fileFindMany.mockResolvedValue([{
      id: 'visible-file',
      originalName: 'scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
    }]);
    const storage = new WorkspaceStorageService(
      { folder: { findMany: folderFindMany }, storedFile: { findMany: fileFindMany } } as unknown as PrismaService,
      {} as ObjectStorageService,
      { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
      {} as never,
    );

    await expect(storage.listUnindexed('workspace-a', 'staff-a')).resolves.toEqual([{
      id: 'visible-file',
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '120',
    }]);
    expect(fileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'workspace-a',
        status: 'READY',
        deletedAt: null,
        ocrText: null,
        folderId: { in: ['download-folder'] },
      }),
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    }));
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-a', 'staff-a', 'download-folder', 'downloadFiles');
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-a', 'staff-a', 'view-only-folder', 'downloadFiles');
  });

  it('searches visible workspace files by OCR content without returning OCR text', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    folderFindMany.mockResolvedValue([{ id: 'visible-folder' }, { id: 'inaccessible-folder' }]);
    authorizeFolder.mockImplementation(async (_workspaceId: string, _userId: string, folderId: string, permission: string) => {
      if (folderId !== 'visible-folder' || permission !== 'viewFiles') throw new NotFoundException();
      return {};
    });
    const createdAt = new Date();
    fileFindMany.mockResolvedValue([{
      id: 'content-match',
      originalName: 'scan.pdf',
      ocrText: 'Confidential invoice reference',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
      folderId: 'visible-folder',
      createdAt,
      isFavorite: false,
    }]);
    const storage = new WorkspaceStorageService(
      { folder: { findMany: folderFindMany }, storedFile: { findMany: fileFindMany } } as unknown as PrismaService,
      {} as ObjectStorageService,
      { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
      {} as never,
    );

    const result = await storage.search('workspace-a', 'staff-a', 'invoice');

    expect(result).toEqual({
      workspaceId: 'workspace-a',
      files: [{
        id: 'content-match',
        name: 'scan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '120',
        folderId: 'visible-folder',
        createdAt,
        isFavorite: false,
        canDownload: false,
        matchedBy: 'content',
      }],
    });
    expect(JSON.stringify(result)).not.toContain('Confidential');
    expect(fileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId: 'workspace-a',
        folderId: { in: ['visible-folder'] },
        OR: [
          { originalName: { contains: 'invoice', mode: 'insensitive' } },
          { ocrText: { contains: 'invoice', mode: 'insensitive' } },
        ],
      }),
      take: 50,
    }));
  });

  it('allows OCR updates for members with view access to the file', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'file-a',
      folderId: 'visible-folder',
      userId: 'uploader-a',
      objectKey: 'key',
      originalName: 'scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    authorizeFolder.mockResolvedValue({});
    const storage = new WorkspaceStorageService(
      { storedFile: { findFirst, updateMany } } as unknown as PrismaService,
      {} as ObjectStorageService,
      { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
      {} as never,
    );

    await expect(storage.setOcrText('workspace-a', 'staff-a', 'file-a', 'invoice terms'))
      .resolves.toEqual({ id: 'file-a', characterCount: 13 });
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-a', 'staff-a', 'visible-folder', 'viewFiles');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-a',
        workspaceId: 'workspace-a',
        folderId: 'visible-folder',
        status: 'READY',
      },
      data: { ocrText: 'invoice terms' },
    });
  });

  it('denies non-admin access to OCR updates for root files', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'root-file',
      folderId: null,
      userId: 'uploader-a',
      objectKey: 'key',
      originalName: 'private.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
    });
    const updateMany = jest.fn();
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    const storage = new WorkspaceStorageService(
      { storedFile: { findFirst, updateMany } } as unknown as PrismaService,
      {} as ObjectStorageService,
      { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
      {} as never,
    );

    await expect(storage.setOcrText('workspace-a', 'staff-a', 'root-file', 'private text'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('includes root-level files only for workspace administrators in search', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    fileFindMany.mockResolvedValue([{
      id: 'root-file',
      originalName: 'records.pdf',
      ocrText: null,
      mimeType: 'application/pdf',
      sizeBytes: 120n,
      folderId: null,
      createdAt: new Date(),
      isFavorite: false,
    }]);

    const result = await service.search('workspace-a', 'admin-a', 'records');
    expect(result).toMatchObject({
      workspaceId: 'workspace-a',
      files: [{ id: 'root-file', canDownload: true, matchedBy: 'name' }],
    });
    expect(fileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ folderId: expect.anything() }),
      take: 50,
    }));
  });

  it.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])(
    'allows a %s to create a root shared folder',
    async (role) => {
      authorizeWorkspace.mockResolvedValue({ role });
      folderCreate.mockResolvedValue({
        id: 'folder-a', name: 'Operations', parentFolderId: null, createdAt: new Date(),
      });

      await expect(service.createFolder('workspace-a', 'creator-a', 'Operations'))
        .resolves.toMatchObject({ id: 'folder-a', name: 'Operations' });
      expect(folderCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: { workspaceId: 'workspace-a', userId: 'creator-a', name: 'Operations', parentFolderId: null },
      }));
    },
  );

  it('creates a shared folder with view-and-upload access for selected active staff', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.OWNER });
    folderCreate.mockResolvedValue({
      id: 'folder-a', name: 'Operations', parentFolderId: null, createdAt: new Date(),
    });
    memberFindMany.mockResolvedValue([{ id: 'member-staff', userId: 'staff-a' }]);

    await expect(service.createFolder('workspace-a', 'owner-a', 'Operations', undefined, ['member-staff']))
      .resolves.toMatchObject({ id: 'folder-a', name: 'Operations' });

    expect(permissionCreateMany).toHaveBeenCalledWith({
      data: [{
        workspaceId: 'workspace-a',
        folderId: 'folder-a',
        memberId: 'member-staff',
        effect: 'GRANT',
        permissionKeys: ['viewFolder', 'viewFiles', 'downloadFiles', 'uploadFiles', 'createSubfolders'],
        inherit: true,
        createdById: 'owner-a',
        updatedById: 'owner-a',
      }],
    });
    expect(notificationCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        workspaceId: 'workspace-a',
        userId: 'staff-a',
        type: 'FOLDER_ACCESS_GRANTED',
      })],
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects attempts to assign inactive or non-staff workspace members', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.OWNER });
    folderCreate.mockResolvedValue({
      id: 'folder-a', name: 'Operations', parentFolderId: null, createdAt: new Date(),
    });
    memberFindMany.mockResolvedValue([]);

    await expect(service.createFolder('workspace-a', 'owner-a', 'Operations', undefined, ['member-admin']))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(permissionCreateMany).not.toHaveBeenCalled();
  });

  it('records the edited document and changed locations in workspace activity', async () => {
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-id' });
    const file = {
      id: 'file-a',
      userId: 'owner-a',
      folderId: null,
      objectKey: 'old-key',
      originalName: 'Plan.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 4n,
    };
    const tx = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ storageUsedBytes: 4n, storageReservedBytes: 0n }) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ plan: 'BUSINESS' }) },
      storedFile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      storedFile: { findFirst: jest.fn().mockResolvedValue(file) },
      subscription: { findUnique: jest.fn().mockResolvedValue({ plan: 'BUSINESS' }) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx)),
    };
    const objects = {
      assertConfigured: jest.fn().mockResolvedValue(undefined),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const workspaces = {
      authorizeWorkspace: jest.fn().mockResolvedValue({
        role: WorkspaceRole.OWNER,
        workspace: { ownerUserId: 'owner-a' },
      }),
      authorizeFolder,
    };
    const plans = {
      currentPlan: jest.fn().mockResolvedValue('BUSINESS'),
      getEntitlements: jest.fn().mockResolvedValue({ storageLimitBytes: 1024n }),
      requireFeature: jest.fn().mockResolvedValue(undefined),
    };
    const storage = new WorkspaceStorageService(
      prisma as unknown as PrismaService,
      objects as unknown as ObjectStorageService,
      workspaces as unknown as WorkspacesService,
      plans as never,
    );

    await expect(storage.replaceContent(
      'workspace-a',
      'owner-a',
      'file-a',
      { buffer: Buffer.from('edit'), size: 4, originalname: 'Plan.xlsx', mimetype: file.mimeType },
      'Edited 2 spreadsheet cells: Sheet1!A1, Sheet1!B2',
    )).resolves.toMatchObject({ id: 'file-a', name: 'Plan.xlsx' });

    expect(tx.storedFile.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ocrText: null }),
    }));
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'FILE_EDITED',
        targetId: 'file-a',
        metadata: {
          fileName: 'Plan.xlsx',
          changeSummary: 'Edited 2 spreadsheet cells: Sheet1!A1, Sheet1!B2',
        },
      }),
    });
  });

  it('shows an assigned subfolder at the top level when its parent is inaccessible', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    folderFindMany.mockResolvedValue([
      { id: 'private-parent', name: 'Private', parentFolderId: null },
      { id: 'shared-child', name: 'Shared with me', parentFolderId: 'private-parent' },
    ]);
    authorizeFolder.mockImplementation(async (_workspaceId: string, _userId: string, folderId: string) => {
      if (folderId === 'shared-child') return;
      throw new NotFoundException();
    });

    await expect(service.list('workspace-a', 'staff-a')).resolves.toEqual({
      workspaceId: 'workspace-a',
      folderId: null,
      folders: [{ id: 'shared-child', name: 'Shared with me', parentFolderId: null }],
      files: [],
    });
    expect(folderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace-a' } }));
  });

  it('checks download permission before reading an object', async () => {
    fileFindFirst.mockResolvedValue({
      id: 'file-a',
      userId: 'uploader-a',
      folderId: 'folder-a',
      objectKey: 'workspace/file-a',
      originalName: 'payroll.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10n,
    });
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    authorizeFolder.mockRejectedValue(new NotFoundException());

    await expect(service.download('workspace-a', 'staff-a', 'file-a'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-a', 'staff-a', 'folder-a', 'downloadFiles');
    expect(getObject).not.toHaveBeenCalled();
  });

  it('does not turn non-authorization failures into empty folder results', async () => {
    authorizeWorkspace.mockResolvedValue({ role: WorkspaceRole.STAFF });
    folderFindMany.mockResolvedValue([{ id: 'folder-a', name: 'Projects', parentFolderId: null }]);
    authorizeFolder.mockRejectedValue(new Error('database unavailable'));

    await expect(service.list('workspace-a', 'staff-a')).rejects.toThrow('database unavailable');
  });
});
