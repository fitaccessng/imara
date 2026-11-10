jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    Logger: class {
      warn() {}
      debug() {}
      error() {}
    },
    NotFoundException: MockHttpException,
    PayloadTooLargeException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { PayloadTooLargeException } from '@nestjs/common';
import { FileCategory, StoredFileStatus, StoredFileUploadSource } from '@prisma/client';
import { assertSameFileExtension, StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';

describe('replacement file extension validation', () => {
  it('accepts a matching extension regardless of case', () => {
    expect(() => assertSameFileExtension('report.DOCX', 'edited-report.docx')).not.toThrow();
  });

  it('rejects a different or missing extension', () => {
    expect(() => assertSameFileExtension('report.docx', 'report.pdf')).toThrow('same file extension');
    expect(() => assertSameFileExtension('report.docx', 'report')).toThrow('same file extension');
  });
});

describe('StorageService quota-safe uploads', () => {
  const fileRow = {
    id: 'file-id',
    userId: 'owner-id',
    objectKey: 'owner-id/random-key',
    originalName: 'pending',
    mimeType: 'application/octet-stream',
    sizeBytes: 12n,
    folderId: null,
    workspaceId: null,
    eventId: null,
    status: StoredFileStatus.UPLOADING,
    uploadSource: StoredFileUploadSource.STANDARD,
    quotaReserved: true,
    isFavorite: false,
    contentHash: null,
    category: FileCategory.OTHER,
    tags: [],
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const transactionClient = {
    event: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    folder: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({
        id: 'folder-id',
        name: 'Reports',
        parentFolderId: 'target-id',
        createdAt: new Date(),
      }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'subscription-id',
        plan: 'FREE',
        storageUsedBytes: 20n,
        storageReservedBytes: 0n,
        storageLimitBytes: 100n,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    storedFile: {
      create: jest.fn().mockResolvedValue(fileRow),
      findFirst: jest.fn().mockResolvedValue(fileRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'file-id',
        originalName: 'passport.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12n,
        folderId: null,
        createdAt: fileRow.createdAt,
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue(fileRow),
    },
  };
  const folderFindMany = jest.fn().mockResolvedValue([]);
  const storedFileFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    folder: {
      findMany: folderFindMany,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    storedFile: {
      findMany: storedFileFindMany,
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
  } as unknown as PrismaService;
  const objects = {
    assertConfigured: jest.fn(),
    put: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  } as unknown as ObjectStorageService;
  const planCatalogue = {
    currentPlan: jest.fn(async (subscription: { plan: string }) => subscription.plan),
    getEntitlements: jest.fn().mockResolvedValue({
      staffLimit: 3,
      activeEventLimit: 3,
      storageLimitBytes: 100n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
    }),
    requireFeature: jest.fn().mockResolvedValue(undefined),
  } as unknown as PlanCatalogueService;
  const service = new StorageService(prisma, objects, planCatalogue);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(planCatalogue.getEntitlements).mockResolvedValue({
      staffLimit: 3,
      activeEventLimit: 3,
      storageLimitBytes: 100n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
    });
    transactionClient.event.findUnique.mockResolvedValue({
      id: 'event-id',
      ownerUserId: 'owner-id',
      folderId: 'event-folder-id',
      status: 'ACTIVE',
      storageCapBytes: 100n,
      storageUsedBytes: 0n,
      storageReservedBytes: 0n,
    });
    transactionClient.event.findFirst.mockResolvedValue({ id: 'event-id' });
    transactionClient.event.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.folder.findFirst.mockResolvedValue(null);
    transactionClient.folder.update.mockResolvedValue({
      id: 'folder-id',
      name: 'Reports',
      parentFolderId: 'target-id',
      createdAt: new Date(),
    });
    transactionClient.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      plan: 'FREE',
      storageUsedBytes: 20n,
      storageReservedBytes: 0n,
      storageLimitBytes: 100n,
    });
    transactionClient.subscription.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.storedFile.create.mockResolvedValue(fileRow);
    transactionClient.storedFile.findFirst.mockResolvedValue(fileRow);
    transactionClient.storedFile.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.storedFile.findUniqueOrThrow.mockResolvedValue({
      id: 'file-id',
      originalName: 'passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12n,
      folderId: null,
      createdAt: fileRow.createdAt,
    });
    transactionClient.storedFile.deleteMany.mockResolvedValue({ count: 1 });
    transactionClient.storedFile.delete.mockResolvedValue(fileRow);
    jest.mocked(prisma.storedFile.findFirst).mockReset();
    jest.mocked(prisma.storedFile.updateMany).mockResolvedValue({ count: 1 });
    storedFileFindMany.mockResolvedValue([]);
    folderFindMany.mockResolvedValue([]);
    jest.mocked(objects.put).mockResolvedValue(undefined);
    jest.mocked(objects.delete).mockResolvedValue(undefined);
  });

  it('searches names across the user personal library and normalizes file metadata', async () => {
    const folder = { id: 'folder-id', name: 'Tax Records', parentFolderId: null, createdAt: new Date() };
    const file = {
      id: 'file-id',
      originalName: 'tax-return.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 120n,
      folderId: 'folder-id',
      createdAt: new Date(),
    };
    folderFindMany.mockResolvedValue([folder]);
    storedFileFindMany.mockResolvedValue([file]);

    await expect(service.search('owner-id', 'tax')).resolves.toEqual({
      query: 'tax',
      folders: [folder],
      files: [{
        id: 'file-id',
        name: 'tax-return.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '120',
        folderId: 'folder-id',
        createdAt: file.createdAt,
      }],
    });
    expect(folderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'owner-id', workspaceId: null, name: { contains: 'tax', mode: 'insensitive' } },
      take: 50,
    }));
    expect(storedFileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner-id',
        workspaceId: null,
        status: StoredFileStatus.READY,
        originalName: { contains: 'tax', mode: 'insensitive' },
      }),
      take: 50,
    }));
  });

  it('moves a folder to a validated parent', async () => {
    transactionClient.folder.findFirst
      .mockResolvedValueOnce({ id: 'folder-id' })
      .mockResolvedValueOnce({ id: 'target-id', parentFolderId: null });

    await service.moveFolder('owner-id', 'folder-id', 'target-id');

    expect(transactionClient.folder.update).toHaveBeenCalledWith({
      where: { id: 'folder-id', workspaceId: null },
      data: { parentFolderId: 'target-id' },
      select: { id: true, name: true, parentFolderId: true, createdAt: true, isFavorite: true },
    });
  });

  it('rejects moving a folder into one of its descendants', async () => {
    transactionClient.folder.findFirst
      .mockResolvedValueOnce({ id: 'folder-id' })
      .mockResolvedValueOnce({ id: 'child-id', parentFolderId: 'folder-id' });

    await expect(service.moveFolder('owner-id', 'folder-id', 'child-id')).rejects.toThrow(
      'A folder cannot be moved into itself or one of its subfolders',
    );
    expect(transactionClient.folder.update).not.toHaveBeenCalled();
  });

  it('reserves quota atomically before writing the object and returns metadata only', async () => {
    const body = Buffer.alloc(12);
    const result = await service.upload('owner-id', {
      buffer: body,
      originalname: '../passport.pdf',
      mimetype: 'application/pdf',
      size: 12,
    });

    expect(transactionClient.subscription.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'subscription-id',
        storageUsedBytes: 20n,
        storageReservedBytes: 0n,
      },
      data: { storageReservedBytes: { increment: 12n } },
    });
    expect(objects.put).toHaveBeenCalledWith(fileRow.objectKey, body, 'application/pdf');
    const finalizedData = jest.mocked(transactionClient.storedFile.updateMany).mock.calls
      .find(([args]) => 'contentHash' in args.data)?.[0].data;
    expect(finalizedData?.category).toBe(FileCategory.PERSONAL);
    expect(finalizedData?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toEqual(expect.objectContaining({ id: 'file-id', name: 'passport.pdf', sizeBytes: '12' }));
    expect(result).not.toHaveProperty('objectKey');
  });

  it('rejects uploads that exceed remaining quota before contacting object storage', async () => {
    jest.mocked(planCatalogue.getEntitlements).mockResolvedValue({
      staffLimit: 3,
      activeEventLimit: 3,
      storageLimitBytes: 95n,
      canEditDocuments: true,
      canScanDocuments: true,
      advancedTeamManagement: false,
    });
    transactionClient.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      plan: 'FREE',
      storageUsedBytes: 90n,
      storageReservedBytes: 0n,
      // The persisted catalogue value, not this legacy subscription snapshot,
      // is authoritative for the current quota.
      storageLimitBytes: 100n,
    });

    await expect(service.upload('owner-id', {
      buffer: Buffer.alloc(12),
      originalname: 'large.pdf',
      mimetype: 'application/pdf',
      size: 12,
    })).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(objects.put).not.toHaveBeenCalled();
    expect(transactionClient.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('reserves event and account storage before uploading event media', async () => {
    const body = Buffer.alloc(12);
    await service.uploadEvent('event-id', {
      buffer: body,
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: body.length,
    });

    expect(transactionClient.event.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'event-id', status: 'ACTIVE', storageUsedBytes: 0n, storageReservedBytes: 0n }),
      data: { storageReservedBytes: { increment: 12n } },
    }));
    expect(transactionClient.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { storageReservedBytes: { increment: 12n } },
    }));
    expect(objects.put).toHaveBeenCalledWith(fileRow.objectKey, body, 'image/png');
  });

  it('rejects event uploads that exceed the event cap', async () => {
    transactionClient.event.findUnique.mockResolvedValue({
      id: 'event-id',
      ownerUserId: 'owner-id',
      folderId: 'event-folder-id',
      status: 'ACTIVE',
      storageCapBytes: 100n,
      storageUsedBytes: 95n,
      storageReservedBytes: 0n,
    });
    await expect(service.uploadEvent('event-id', {
      buffer: Buffer.alloc(12),
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 12,
    })).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(objects.put).not.toHaveBeenCalled();
  });

  it('moves an active file to the recycle bin without releasing its quota', async () => {
    await service.deleteFile('owner-id', 'file-id');

    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-id',
        userId: 'owner-id',
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
    expect(objects.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates favourite state only for an active personal file', async () => {
    await expect(service.setFavorite('owner-id', 'file-id', true)).resolves.toEqual({
      id: 'file-id',
      isFavorite: true,
    });

    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-id',
        userId: 'owner-id',
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: null,
      },
      data: { isFavorite: true },
    });
  });

  it('updates favourite state only for an owned personal folder', async () => {
    await expect(service.setFolderFavorite('owner-id', 'folder-id', true)).resolves.toEqual({
      id: 'folder-id',
      isFavorite: true,
    });

    expect(prisma.folder.updateMany).toHaveBeenCalledWith({
      where: { id: 'folder-id', userId: 'owner-id', workspaceId: null },
      data: { isFavorite: true },
    });
  });

  it('updates categories and normalized tags only for an owned file', async () => {
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(fileRow);
    jest.mocked(prisma.storedFile.update).mockResolvedValue({
      ...fileRow,
      category: FileCategory.FINANCE,
      tags: ['tax', 'receipt'],
    });

    await expect(service.updateOrganization('owner-id', 'file-id', {
      category: FileCategory.FINANCE,
      tags: [' tax ', 'receipt'],
    })).resolves.toEqual(expect.objectContaining({ id: 'file-id', category: FileCategory.FINANCE, tags: ['tax', 'receipt'] }));

    expect(prisma.storedFile.update).toHaveBeenCalledWith({
      where: { id: 'file-id' },
      data: { category: FileCategory.FINANCE, tags: ['tax', 'receipt'] },
      select: { id: true, category: true, tags: true },
    });
  });

  it('rejects duplicate tags that differ only by letter case', async () => {
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(fileRow);
    await expect(service.updateOrganization('owner-id', 'file-id', {
      tags: ['Tax', 'tax'],
    })).rejects.toThrow('Tags must be unique');
    expect(prisma.storedFile.update).not.toHaveBeenCalled();
  });

  it('releases reserved rather than used quota when permanently removing a pending reservation', async () => {
    const deletingRow = { ...fileRow, status: StoredFileStatus.DELETING, quotaReserved: true };
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(deletingRow);
    transactionClient.storedFile.findFirst.mockResolvedValue(deletingRow);

    await service.permanentlyDeleteFile('owner-id', 'file-id');

    expect(transactionClient.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner-id', storageReservedBytes: { gte: 12n } },
      data: { storageReservedBytes: { decrement: 12n } },
    });
  });

  it('permanently deletes a trashed file and releases used storage', async () => {
    const trashedRow = { ...fileRow, status: StoredFileStatus.READY, quotaReserved: false, deletedAt: new Date() };
    const deletingRow = { ...trashedRow, status: StoredFileStatus.DELETING };
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(trashedRow);
    transactionClient.storedFile.findFirst.mockResolvedValue(deletingRow);

    await service.permanentlyDeleteFile('owner-id', 'file-id');

    expect(objects.delete).toHaveBeenCalledWith(fileRow.objectKey);
    expect(transactionClient.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner-id', storageUsedBytes: { gte: 12n } },
      data: { storageUsedBytes: { decrement: 12n } },
    });
    expect(transactionClient.storedFile.delete).toHaveBeenCalledWith({ where: { id: 'file-id' } });
  });

  it('keeps a removed object queued for recovery when database finalization fails', async () => {
    const readyRow = { ...fileRow, status: StoredFileStatus.READY, quotaReserved: false, deletedAt: new Date() };
    const deletingRow = { ...readyRow, status: StoredFileStatus.DELETING };
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(readyRow);
    transactionClient.storedFile.findFirst.mockResolvedValue(deletingRow);
    transactionClient.subscription.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.permanentlyDeleteFile('owner-id', 'file-id')).rejects.toThrow(
      'File deletion is pending; please retry shortly.',
    );

    expect(objects.delete).toHaveBeenCalledWith(fileRow.objectKey);
    expect(prisma.storedFile.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: { id: 'file-id', userId: 'owner-id', workspaceId: null, deletedAt: { not: null }, status: StoredFileStatus.READY },
      data: { status: StoredFileStatus.DELETING },
    });
  });

  it('restores a ready file when the object-store deletion fails', async () => {
    const readyRow = { ...fileRow, status: StoredFileStatus.READY, quotaReserved: false, deletedAt: new Date() };
    jest.mocked(prisma.storedFile.findFirst).mockResolvedValue(readyRow);
    jest.mocked(objects.delete).mockRejectedValue(new Error('provider unavailable'));

    await expect(service.permanentlyDeleteFile('owner-id', 'file-id')).rejects.toThrow(
      'File storage is temporarily unavailable.',
    );

    expect(prisma.storedFile.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'file-id', userId: 'owner-id', workspaceId: null, status: StoredFileStatus.DELETING },
      data: { status: StoredFileStatus.READY },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('restores a file from the recycle bin without changing its storage usage', async () => {
    await service.restoreFile('owner-id', 'file-id');

    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-id',
        userId: 'owner-id',
        workspaceId: null,
        status: StoredFileStatus.READY,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
