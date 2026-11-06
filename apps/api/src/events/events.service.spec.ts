jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    NotFoundException: MockHttpException,
    PayloadTooLargeException: MockHttpException,
    UnauthorizedException: MockHttpException,
  };
});

import { EventGallerySetting } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { hashToken } from '../auth/token';
import { ObjectStorageService } from '../storage/object-storage.service';
import { StorageService } from '../storage/storage.service';
import { EventsService, isSupportedMedia } from './events.service';

describe('EventsService media access', () => {
  const event = {
    id: 'event-id',
    ownerUserId: 'owner-id',
    name: 'Wedding',
    date: new Date('2026-10-01T00:00:00.000Z'),
    description: null,
    gallerySetting: EventGallerySetting.PASSCODE,
    galleryPasscodeHash: '',
  };
  const prisma = {
    event: { findFirst: jest.fn() },
    eventGalleryGrant: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    storedFile: { findMany: jest.fn() },
  };
  const objects = { get: jest.fn() };
  const service = new EventsService(
    prisma as any,
    {} as StorageService,
    objects as unknown as ObjectStorageService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts supported image signatures and rejects MIME-spoofed media', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
    expect(isSupportedMedia({
      buffer: png, originalname: 'photo.png', mimetype: 'image/png', size: png.length,
    })).toBe(true);
    expect(isSupportedMedia({
      buffer: webm,
      originalname: 'clip.webm',
      mimetype: 'video/webm;codecs=vp8,opus',
      size: webm.length,
    })).toBe(true);
    expect(isSupportedMedia({
      buffer: Buffer.from('not an image'), originalname: 'photo.png', mimetype: 'image/png', size: 12,
    })).toBe(false);
    expect(isSupportedMedia({
      buffer: png, originalname: 'photo.txt', mimetype: 'text/plain', size: png.length,
    })).toBe(false);
  });

  it('does not expose media from a private gallery', async () => {
    prisma.event.findFirst.mockResolvedValue({
      ...event,
      gallerySetting: EventGallerySetting.PRIVATE,
    });

    await expect(service.gallery('private-gallery-token')).rejects.toThrow('Gallery not found');
    expect(prisma.storedFile.findMany).not.toHaveBeenCalled();
  });

  it('issues a short-lived hashed grant after passcode verification, then serves media', async () => {
    const passcodeHash = await hashPassword('correct horse');
    prisma.event.findFirst.mockResolvedValue({ ...event, galleryPasscodeHash: passcodeHash });
    prisma.eventGalleryGrant.create.mockResolvedValue({});
    prisma.eventGalleryGrant.findFirst.mockResolvedValue({ id: 'grant-id' });
    prisma.storedFile.findMany.mockResolvedValue([{
      id: 'media-id',
      originalName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 123n,
      createdAt: new Date(),
    }]);

    const grant = await service.unlockGallery('gallery-token', 'correct horse');
    expect(grant.accessToken).toHaveLength(43);
    expect(prisma.eventGalleryGrant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventId: event.id,
        userId: event.ownerUserId,
        tokenHash: hashToken(grant.accessToken),
        expiresAt: grant.expiresAt,
      }),
    }));
    expect(prisma.eventGalleryGrant.create.mock.calls[0][0].data.tokenHash).not.toBe(grant.accessToken);

    const result = await service.gallery('gallery-token', `Bearer ${grant.accessToken}`);
    expect(prisma.eventGalleryGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: event.id,
        userId: event.ownerUserId,
        tokenHash: hashToken(grant.accessToken),
      }),
    }));
    expect(result.media).toEqual([expect.objectContaining({ id: 'media-id', name: 'photo.png', sizeBytes: '123' })]);
  });

  it('does not create an access grant for a wrong passcode', async () => {
    prisma.event.findFirst.mockResolvedValue({ ...event, galleryPasscodeHash: await hashPassword('right passcode') });

    await expect(service.unlockGallery('gallery-token', 'wrong passcode')).rejects.toThrow('Invalid passcode');
    expect(prisma.eventGalleryGrant.create).not.toHaveBeenCalled();
  });
});
