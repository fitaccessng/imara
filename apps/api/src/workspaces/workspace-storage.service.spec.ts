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
  const fileFindMany = jest.fn();
  const fileFindFirst = jest.fn();
  const getObject = jest.fn();
  const authorizeWorkspace = jest.fn();
  const authorizeFolder = jest.fn();

  const service = new WorkspaceStorageService(
    {
      folder: { findMany: folderFindMany },
      storedFile: { findMany: fileFindMany, findFirst: fileFindFirst },
    } as unknown as PrismaService,
    { get: getObject } as unknown as ObjectStorageService,
    { authorizeWorkspace, authorizeFolder } as unknown as WorkspacesService,
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
