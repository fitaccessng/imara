jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { FileSharesService } from './file-shares.service';

describe('FileSharesService', () => {
  const fileFindFirst = jest.fn();
  const shareCreate = jest.fn();
  const shareFindFirst = jest.fn();
  const shareFindMany = jest.fn();
  const shareUpdateMany = jest.fn();
  const auditCreate = jest.fn();
  const authorizeWorkspace = jest.fn();
  const authorizeFolder = jest.fn();

  const tx = {
    storedFile: { findFirst: fileFindFirst },
    publicFileShare: {
      create: shareCreate,
      findFirst: shareFindFirst,
      updateMany: shareUpdateMany,
    },
    auditLog: { create: auditCreate },
  };
  const prisma = {
    storedFile: { findFirst: fileFindFirst },
    publicFileShare: {
      create: shareCreate,
      findFirst: shareFindFirst,
      findMany: shareFindMany,
      updateMany: shareUpdateMany,
    },
    auditLog: { create: auditCreate },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const objects = { get: jest.fn() };
  const workspaces = { authorizeWorkspace, authorizeFolder };
  const service = new FileSharesService(
    prisma as never,
    objects as never,
    workspaces as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a personal share with a one-time random token and stores only its hash', async () => {
    fileFindFirst.mockResolvedValue({ id: 'file-id' });
    shareCreate.mockImplementation(async ({ data }) => ({
      id: 'share-id',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      storedHash: data.tokenHash,
    }));

    const result = await service.createPersonal('owner-id', 'file-id');

    expect(result).toMatchObject({ id: 'share-id', createdAt: new Date('2026-01-01T00:00:00Z') });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(shareCreate).toHaveBeenCalledWith({
      data: {
        fileId: 'file-id',
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
      },
      select: { id: true, createdAt: true },
    });
    expect(JSON.stringify(shareCreate.mock.calls[0][0])).not.toContain(result.token);
  });

  it('rejects personal share creation unless the file is a ready, live Drive file owned by the user', async () => {
    fileFindFirst.mockResolvedValue(null);
    await expect(service.createPersonal('other-user', 'file-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(shareCreate).not.toHaveBeenCalled();
    expect(fileFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'other-user',
        workspaceId: null,
        eventId: null,
        status: 'READY',
        deletedAt: null,
      }),
    }));
  });

  it('lists only public share IDs and state, and revokes an owned link', async () => {
    fileFindFirst.mockResolvedValue({ id: 'file-id' });
    shareFindMany.mockResolvedValue([{ id: 'share-id', createdAt: new Date(), revokedAt: null }]);
    shareUpdateMany.mockResolvedValue({ count: 1 });

    const result = await service.listPersonal('owner-id', 'file-id');
    await service.revokePersonal('owner-id', 'file-id', 'share-id');

    expect(result[0]).toHaveProperty('id', 'share-id');
    expect(result[0]).not.toHaveProperty('token');
    expect(result[0]).not.toHaveProperty('tokenHash');
    expect(shareUpdateMany).toHaveBeenCalledWith({
      where: { id: 'share-id', fileId: 'file-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('looks up public shares by hash and returns only safe metadata', async () => {
    const token = 'a'.repeat(43);
    shareFindFirst.mockResolvedValue({
      file: {
        objectKey: 'private/object',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123n,
      },
    });

    await expect(service.getPublicMetadata(token)).resolves.toEqual({
      name: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '123',
    });
    expect(shareFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        revokedAt: null,
        file: { status: 'READY', deletedAt: null },
      }),
      select: { file: { select: expect.objectContaining({ originalName: true, mimeType: true, sizeBytes: true }) } },
    }));
  });

  it('returns not found for malformed, unknown, or revoked public tokens', async () => {
    await expect(service.getPublicMetadata('invalid')).rejects.toBeInstanceOf(NotFoundException);
    expect(shareFindFirst).not.toHaveBeenCalled();

    shareFindFirst.mockResolvedValue(null);
    await expect(service.getPublicMetadata('b'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('streams shared bytes as read-only content', async () => {
    shareFindFirst.mockResolvedValue({
      file: {
        objectKey: 'private/object',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123n,
      },
    });
    const body = {} as never;
    objects.get.mockResolvedValue({ body });

    await expect(service.downloadPublic('c'.repeat(43))).resolves.toEqual({
      body,
      name: 'report.pdf',
      contentType: 'application/pdf',
    });
    expect(objects.get).toHaveBeenCalledWith('private/object');
  });

  it('requires workspace shareFiles permission and records workspace share audit events', async () => {
    authorizeWorkspace.mockResolvedValue({ role: 'STAFF' });
    authorizeFolder.mockResolvedValue({});
    fileFindFirst.mockResolvedValue({ id: 'file-id', folderId: 'folder-id' });
    shareCreate.mockResolvedValue({ id: 'share-id', createdAt: new Date() });

    const result = await service.createWorkspace('workspace-id', 'member-id', 'file-id');

    expect(result).toHaveProperty('token');
    expect(authorizeFolder).toHaveBeenCalledWith('workspace-id', 'member-id', 'folder-id', 'shareFiles');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-id',
        actorId: 'member-id',
        action: 'FILE_SHARE_CREATED',
        targetId: 'share-id',
      }),
    });
  });

  it('records workspace share revocation only once', async () => {
    authorizeWorkspace.mockResolvedValue({ role: 'OWNER' });
    fileFindFirst.mockResolvedValue({ id: 'file-id', folderId: null });
    shareFindFirst.mockResolvedValue({ id: 'share-id', revokedAt: null });
    shareUpdateMany.mockResolvedValue({ count: 1 });

    await service.revokeWorkspace('workspace-id', 'owner-id', 'file-id', 'share-id');

    expect(shareUpdateMany).toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-id',
        actorId: 'owner-id',
        action: 'FILE_SHARE_REVOKED',
        targetId: 'share-id',
      }),
    });
  });
});
