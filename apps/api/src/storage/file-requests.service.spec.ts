jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    NotFoundException: MockHttpException,
  };
});

import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { FileRequestsService } from './file-requests.service';

describe('FileRequestsService', () => {
  const folderFindFirst = jest.fn();
  const fileRequestCreate = jest.fn();
  const fileRequestFindMany = jest.fn();
  const fileRequestFindFirst = jest.fn();
  const fileRequestUpdateMany = jest.fn();
  const tx = {
    folder: { findFirst: folderFindFirst },
    fileRequest: { create: fileRequestCreate },
  };
  const prisma = {
    folder: { findFirst: folderFindFirst },
    fileRequest: {
      create: fileRequestCreate,
      findMany: fileRequestFindMany,
      findFirst: fileRequestFindFirst,
      updateMany: fileRequestUpdateMany,
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const storage = { upload: jest.fn() };
  const plans = { currentPlan: jest.fn().mockResolvedValue(Plan.FREE) };
  const service = new FileRequestsService(prisma as never, storage as never, plans as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates a link using a random bearer token and stores only its hash', async () => {
    folderFindFirst.mockResolvedValue({ id: 'folder-id' });
    fileRequestCreate.mockImplementation(async ({ data }) => ({
      id: 'request-id',
      title: data.title,
      message: data.message,
      folderId: data.folderId,
      folder: { name: 'Receipts' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }));

    const result = await service.create('owner-id', {
      destinationFolderId: 'folder-id',
      title: 'Receipts',
      message: 'Please include originals.',
    });
    expect(result).toMatchObject({
      id: 'request-id',
      title: 'Receipts',
      message: 'Please include originals.',
      destinationFolderId: 'folder-id',
      destinationFolderName: 'Receipts',
      linkPath: `/request/${result.token}`,
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fileRequestCreate).toHaveBeenCalledWith({
      data: {
        creatorUserId: 'owner-id',
        folderId: 'folder-id',
        title: 'Receipts',
        message: 'Please include originals.',
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
      },
      select: {
        id: true,
        title: true,
        message: true,
        folderId: true,
        folder: { select: { name: true } },
        createdAt: true,
      },
    });
    expect(JSON.stringify(fileRequestCreate.mock.calls[0][0])).not.toContain(result.token);
  });

  it('does not allow choosing another account or workspace folder', async () => {
    folderFindFirst.mockResolvedValue(null);
    await expect(service.create('owner-id', { title: 'Collect files', destinationFolderId: 'foreign-folder' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(fileRequestCreate).not.toHaveBeenCalled();
    expect(folderFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-folder', userId: 'owner-id', workspaceId: null },
      select: { id: true },
    });
  });

  it('lists owned requests without exposing bearer tokens', async () => {
    const rows = [{
      id: 'request-id',
      title: 'Photos',
      message: null,
      folderId: null,
      folder: null,
      createdAt: new Date(),
      revokedAt: null,
      _count: { uploads: 3 },
    }];
    fileRequestFindMany.mockResolvedValue(rows);
    await expect(service.list('owner-id')).resolves.toEqual([{
      id: 'request-id',
      title: 'Photos',
      message: null,
      createdAt: rows[0].createdAt,
      destinationFolderId: null,
      destinationFolderName: null,
      uploadCount: 3,
      revokedAt: null,
      active: true,
    }]);
    expect(fileRequestFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { creatorUserId: 'owner-id' },
      select: expect.not.objectContaining({ token: true, tokenHash: true }),
    }));
  });

  it('revokes an owned request and is idempotent', async () => {
    fileRequestUpdateMany.mockResolvedValue({ count: 1 });
    await service.revoke('owner-id', 'request-id');
    expect(fileRequestUpdateMany).toHaveBeenCalledWith({
      where: { id: 'request-id', creatorUserId: 'owner-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    fileRequestUpdateMany.mockResolvedValue({ count: 0 });
    fileRequestFindFirst.mockResolvedValue({ id: 'request-id' });
    await expect(service.revoke('owner-id', 'request-id')).resolves.toBeUndefined();
    fileRequestFindFirst.mockResolvedValue(null);
    await expect(service.revoke('other-user', 'request-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns safe metadata and sends uploads through the existing storage quota path', async () => {
    const token = 'a'.repeat(43);
    fileRequestFindFirst.mockResolvedValue({
      id: 'request-id',
      title: 'Photos',
      message: 'Send your photos.',
      folderId: 'folder-id',
      creatorUserId: 'owner-id',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      revokedAt: null,
      folder: { name: 'Photos' },
      creator: {
        name: 'Owner',
        accountStatus: 'ACTIVE',
        subscription: { id: 'subscription-id', userId: 'owner-id', plan: Plan.FREE, currentPeriodEnd: null },
      },
    });
    await expect(service.getPublicMetadata(token)).resolves.toEqual({
      title: 'Photos',
      message: 'Send your photos.',
      ownerName: 'Owner',
      destinationFolderName: 'Photos',
      maxUploadBytes: '104857600',
      active: true,
    });
    expect(fileRequestFindFirst).toHaveBeenCalledWith({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      select: {
        title: true,
        message: true,
        revokedAt: true,
        folder: { select: { name: true } },
        creator: {
          select: {
            name: true,
            accountStatus: true,
            subscription: { select: { id: true, userId: true, plan: true, currentPeriodEnd: true } },
          },
        },
      },
    });

    const file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 12, buffer: Buffer.alloc(12) };
    storage.upload.mockResolvedValue({ id: 'stored-file-id' });
    await expect(service.upload(token, file, 'Photos/2026/photo.jpg')).resolves.toEqual({ id: 'stored-file-id' });
    expect(storage.upload).toHaveBeenCalledWith(
      'owner-id',
      file,
      'folder-id',
      undefined,
      'request-id',
      'Photos/2026/photo.jpg',
    );
  });

  it('rejects malformed, unknown, and revoked tokens', async () => {
    await expect(service.getPublicMetadata('invalid')).rejects.toBeInstanceOf(NotFoundException);
    expect(fileRequestFindFirst).not.toHaveBeenCalled();

    fileRequestFindFirst.mockResolvedValue(null);
    await expect(service.getPublicMetadata('b'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
  });
});
