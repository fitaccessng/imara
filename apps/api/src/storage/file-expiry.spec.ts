jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    Logger: class {
      warn() {}
      debug() {}
      error() {}
    },
    NotFoundException: MockHttpException,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    PayloadTooLargeException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
  };
});

import { validate } from 'class-validator';
import { StorageService } from './storage.service';
import { UpdateFileExpiryDto } from './storage.dto';

describe('personal file expiry', () => {
  const updateMany = jest.fn();
  const fileFindMany = jest.fn();
  const service = new StorageService(
    {
      storedFile: { updateMany, findMany: fileFindMany },
      folder: { findMany: jest.fn().mockResolvedValue([]) },
    } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('accepts a calendar ISO date or null, but rejects missing and invalid dates', async () => {
    for (const expiresAt of ['2026-12-31', null]) {
      const dto = Object.assign(new UpdateFileExpiryDto(), { expiresAt });
      await expect(validate(dto)).resolves.toHaveLength(0);
    }

    for (const expiresAt of ['2026-02-30', '2026-12-31T12:00:00Z', 'not-a-date', undefined]) {
      const dto = Object.assign(new UpdateFileExpiryDto(), { expiresAt });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
    }
  });

  it('only updates an owned, personal, ready, nondeleted file outside event and request uploads', async () => {
    await expect(service.updateExpiry('owner-id', 'file-id', '2026-12-31')).resolves.toEqual({
      id: 'file-id',
      expiresAt: '2026-12-31',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'file-id',
        userId: 'owner-id',
        workspaceId: null,
        eventId: null,
        fileRequestId: null,
        status: 'READY',
        deletedAt: null,
      },
      data: { expiryDate: new Date('2026-12-31T00:00:00.000Z') },
    });
  });

  it('clears a date with null and does not reveal files the user cannot update', async () => {
    await expect(service.updateExpiry('owner-id', 'file-id', null)).resolves.toEqual({
      id: 'file-id',
      expiresAt: null,
    });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'owner-id' }),
      data: { expiryDate: null },
    }));

    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateExpiry('another-user', 'file-id', '2026-12-31')).rejects.toThrow('File not found');
  });

  it('returns a date-only expiresAt value in file listings', async () => {
    fileFindMany.mockResolvedValue([{
      id: 'file-id',
      originalName: 'Passport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10n,
      folderId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      isFavorite: false,
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
    }]);

    await expect(service.list('owner-id')).resolves.toEqual({
      folderId: null,
      folders: [],
      files: [{
        id: 'file-id',
        mimeType: 'application/pdf',
        sizeBytes: '10',
        folderId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        isFavorite: false,
        name: 'Passport.pdf',
        expiresAt: '2026-12-31',
      }],
    });
    expect(fileFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ expiryDate: true }),
    }));
  });
});
