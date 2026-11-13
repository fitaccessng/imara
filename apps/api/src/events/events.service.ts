import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventGallerySetting, EventStatus, Prisma, StoredFileStatus } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth/password';
import { hashToken } from '../auth/token';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  getMaxUploadBytes,
  isUploadInput,
  readUploadPrefix,
  StorageService,
  type UploadInput,
} from '../storage/storage.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { assertPlanCapacity } from '../subscriptions/plan-entitlements';
import { CreateEventDto, GallerySettingDto, UpdateEventDto } from './events.dto';

const GALLERY_GRANT_TTL_MS = 30 * 60 * 1000;

const EVENT_SELECT = {
  id: true,
  name: true,
  date: true,
  description: true,
  gallerySetting: true,
  folderId: true,
  storageCapBytes: true,
  storageUsedBytes: true,
  storageReservedBytes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;
type EventSummary = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

export async function isSupportedMedia(file: UploadInput): Promise<boolean> {
  if (!isUploadInput(file) || !Number.isSafeInteger(file.size)
    || file.size < 1 || file.size > getMaxUploadBytes()) return false;
  const b = await readUploadPrefix(file);
  const mimeType = file.mimetype.split(';', 1)[0].trim().toLowerCase();
  switch (mimeType) {
    case 'image/jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/gif':
      return b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii'));
    case 'image/webp':
      return b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    case 'video/mp4':
    case 'video/quicktime':
      return b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp';
    case 'video/webm':
      return b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    default:
      return false;
  }
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly objects: ObjectStorageService,
    private readonly plans: PlanCatalogueService,
  ) {}

  private serializeEvent(event: EventSummary) {
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      description: event.description,
      gallerySetting: event.gallerySetting,
      folderId: event.folderId,
      storage: {
        capBytes: event.storageCapBytes.toString(),
        usedBytes: event.storageUsedBytes.toString(),
        reservedBytes: event.storageReservedBytes.toString(),
        availableBytes: (event.storageCapBytes - event.storageUsedBytes - event.storageReservedBytes).toString(),
      },
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  async create(userId: string, dto: CreateEventDto) {
    const gallerySetting = (dto.gallerySetting ?? GallerySettingDto.PRIVATE) as EventGallerySetting;
    if (gallerySetting === EventGallerySetting.PASSCODE && !dto.passcode) {
      throw new BadRequestException('A passcode is required for a passcode-protected gallery');
    }
    if (gallerySetting !== EventGallerySetting.PASSCODE && dto.passcode) {
      throw new BadRequestException('A passcode is only valid for a passcode-protected gallery');
    }
    const captureToken = randomBytes(32).toString('base64url');
    const galleryToken = randomBytes(32).toString('base64url');
    const [galleryPasscodeHash] = await Promise.all([
      dto.passcode ? hashPassword(dto.passcode) : Promise.resolve(null),
    ]);

    const event = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({ where: { userId } });
      if (!subscription) throw new NotFoundException('Subscription not found');
      const activeEventCount = await tx.event.count({ where: { ownerUserId: userId, status: EventStatus.ACTIVE } });
      const plan = await this.plans.currentPlan(subscription, tx);
      const entitlements = await this.plans.getEntitlements(plan, tx);
      assertPlanCapacity(plan, activeEventCount, entitlements.activeEventLimit, 'active events');
      const remaining = entitlements.storageLimitBytes
        - subscription.storageUsedBytes
        - subscription.storageReservedBytes;
      if (remaining < 0n) throw new ConflictException('Storage quota counters are inconsistent');
      let folderId = dto.folderId;
      if (folderId) {
        const folder = await tx.folder.findFirst({
          where: { id: folderId, userId, workspaceId: null },
          select: { id: true },
        });
        if (!folder) throw new NotFoundException('Folder not found');
      } else {
        const id = randomUUID();
        const suffix = id.slice(0, 8);
        const name = `${dto.name.trim().slice(0, 109)} (${suffix})`;
        const folder = await tx.folder.create({
          data: { id: randomUUID(), userId, workspaceId: null, name },
          select: { id: true },
        });
        folderId = folder.id;
      }
      return tx.event.create({
        data: {
          ownerUserId: userId,
          folderId,
          name: dto.name.trim(),
          date: new Date(dto.date),
          description: dto.description?.trim() || null,
          captureTokenHash: hashToken(captureToken),
          galleryTokenHash: hashToken(galleryToken),
          gallerySetting,
          galleryPasscodeHash,
          storageCapBytes: remaining,
        },
        select: EVENT_SELECT,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return {
      event: this.serializeEvent(event),
      tokens: { captureToken, galleryToken },
    };
  }

  async list(userId: string) {
    const events = await this.prisma.event.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: EVENT_SELECT,
    });
    return events.map((event) => this.serializeEvent(event));
  }

  async get(userId: string, id: string) {
    const event = await this.prisma.event.findFirst({ where: { id, ownerUserId: userId }, select: EVENT_SELECT });
    if (!event) throw new NotFoundException('Event not found');
    return this.serializeEvent(event);
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    const current = await this.prisma.event.findFirst({
      where: { id, ownerUserId: userId },
      select: { gallerySetting: true, galleryPasscodeHash: true, status: true },
    });
    if (!current) throw new NotFoundException('Event not found');
    if (current.status !== EventStatus.ACTIVE) throw new ConflictException('Event is being deleted');
    const gallerySetting = (dto.gallerySetting ?? current.gallerySetting) as EventGallerySetting;
    if (gallerySetting === EventGallerySetting.PASSCODE && !dto.passcode && !current.galleryPasscodeHash) {
      throw new BadRequestException('A passcode is required for a passcode-protected gallery');
    }
    if (dto.passcode && gallerySetting !== EventGallerySetting.PASSCODE) {
      throw new BadRequestException('A passcode is only valid for a passcode-protected gallery');
    }
    const galleryPasscodeHash = gallerySetting === EventGallerySetting.PASSCODE
      ? (dto.passcode ? await hashPassword(dto.passcode) : current.galleryPasscodeHash)
      : null;
    const changedAccess = gallerySetting !== current.gallerySetting || Boolean(dto.passcode);
    const event = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.updateMany({
        where: { id, ownerUserId: userId, status: EventStatus.ACTIVE },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          gallerySetting,
          galleryPasscodeHash,
        },
      });
      if (!updated.count) throw new ConflictException('Event is no longer available');
      if (changedAccess) await tx.eventGalleryGrant.deleteMany({ where: { eventId: id } });
      return tx.event.findUniqueOrThrow({ where: { id }, select: EVENT_SELECT });
    });
    return this.serializeEvent(event);
  }

  async rotateTokens(userId: string, id: string) {
    const captureToken = randomBytes(32).toString('base64url');
    const galleryToken = randomBytes(32).toString('base64url');
    const updated = await this.prisma.event.updateMany({
      where: { id, ownerUserId: userId, status: EventStatus.ACTIVE },
      data: { captureTokenHash: hashToken(captureToken), galleryTokenHash: hashToken(galleryToken) },
    });
    if (!updated.count) throw new NotFoundException('Event not found');
    await this.prisma.eventGalleryGrant.deleteMany({ where: { eventId: id } });
    return { captureToken, galleryToken };
  }

  async delete(userId: string, id: string): Promise<void> {
    const claimed = await this.prisma.event.updateMany({
      where: { id, ownerUserId: userId, status: EventStatus.ACTIVE },
      data: { status: EventStatus.DELETING },
    });
    const event = await this.prisma.event.findFirst({ where: { id, ownerUserId: userId } });
    if (!event) throw new NotFoundException('Event not found');
    if (!claimed.count && event.status !== EventStatus.DELETING) throw new ConflictException('Event cannot be deleted');
    await this.storage.recoverExpiredReservations(userId);
    const pending = await this.prisma.storedFile.count({
      where: { eventId: id, status: StoredFileStatus.UPLOADING },
    });
    if (pending) throw new ConflictException('Event uploads are still in progress; retry deletion shortly');
    const files = await this.prisma.storedFile.findMany({
      where: { eventId: id, status: { in: [StoredFileStatus.READY, StoredFileStatus.DELETING] } },
      select: { id: true },
    });
    for (const file of files) await this.storage.permanentlyDeleteEventFile(userId, file.id);
    await this.prisma.event.delete({ where: { id } });
  }

  private async activeCaptureEvent(token: string) {
    const event = await this.prisma.event.findFirst({
      where: { captureTokenHash: hashToken(token), status: EventStatus.ACTIVE },
      select: { id: true, ownerUserId: true, name: true, date: true, description: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async captureInfo(token: string) {
    const event = await this.activeCaptureEvent(token);
    const subscription = await this.prisma.subscription.findUnique({ where: { userId: event.ownerUserId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const plan = await this.plans.currentPlan(subscription);
    const entitlements = await this.plans.getEntitlements(plan);
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      description: event.description,
      maxUploadBytes: entitlements.maxUploadBytes.toString(),
    };
  }

  async captureUpload(token: string, file: UploadInput) {
    if (file && Number.isSafeInteger(file.size) && file.size > getMaxUploadBytes()) {
      throw new PayloadTooLargeException('File exceeds the upload size limit');
    }
    if (!await isSupportedMedia(file)) {
      throw new BadRequestException('Only valid JPEG, PNG, GIF, WebP, MP4, QuickTime, or WebM media is accepted');
    }
    const event = await this.activeCaptureEvent(token);
    return this.storage.uploadEvent(event.id, file);
  }

  private async activeGalleryEvent(token: string) {
    const event = await this.prisma.event.findFirst({
      where: { galleryTokenHash: hashToken(token), status: EventStatus.ACTIVE },
      select: {
        id: true, ownerUserId: true, name: true, date: true, description: true,
        gallerySetting: true, galleryPasscodeHash: true,
      },
    });
    if (!event || event.gallerySetting === EventGallerySetting.PRIVATE) throw new NotFoundException('Gallery not found');
    return event;
  }

  async unlockGallery(token: string, passcode: string) {
    const event = await this.activeGalleryEvent(token);
    if (event.gallerySetting !== EventGallerySetting.PASSCODE || !event.galleryPasscodeHash) {
      throw new BadRequestException('This gallery does not require passcode unlock');
    }
    if (!await verifyPassword(event.galleryPasscodeHash, passcode)) {
      throw new UnauthorizedException('Invalid passcode');
    }
    const accessToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + GALLERY_GRANT_TTL_MS);
    await this.prisma.eventGalleryGrant.deleteMany({
      where: { eventId: event.id, expiresAt: { lte: new Date() } },
    });
    await this.prisma.eventGalleryGrant.create({
      data: {
        tokenHash: hashToken(accessToken),
        eventId: event.id,
        userId: event.ownerUserId,
        expiresAt,
      },
    });
    return { accessToken, expiresAt };
  }

  private async authorizeGallery(eventId: string, userId: string, setting: EventGallerySetting, authorization?: string) {
    if (setting === EventGallerySetting.LINK_PUBLIC) return;
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{40,})$/)?.[1];
    if (!token) throw new UnauthorizedException('Gallery access required');
    const grant = await this.prisma.eventGalleryGrant.findFirst({
      where: {
        eventId,
        userId,
        tokenHash: hashToken(token),
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!grant) throw new UnauthorizedException('Gallery access required');
  }

  async gallery(token: string, authorization?: string) {
    const event = await this.activeGalleryEvent(token);
    await this.authorizeGallery(event.id, event.ownerUserId, event.gallerySetting, authorization);
    const media = await this.prisma.storedFile.findMany({
      where: { eventId: event.id, status: StoredFileStatus.READY, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
    return {
      event: { id: event.id, name: event.name, date: event.date, description: event.description },
      media: media.map(({ originalName, sizeBytes, ...item }) => ({
        ...item, name: originalName, sizeBytes: sizeBytes.toString(),
      })),
    };
  }

  async galleryDownload(token: string, mediaId: string, authorization?: string) {
    const event = await this.activeGalleryEvent(token);
    await this.authorizeGallery(event.id, event.ownerUserId, event.gallerySetting, authorization);
    return this.getMediaObject(event.id, mediaId);
  }

  async ownerMedia(userId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, ownerUserId: userId },
      select: {
        files: {
          where: { userId, status: StoredFileStatus.READY, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event.files.map(({ originalName, sizeBytes, ...item }) => ({
      ...item, name: originalName, sizeBytes: sizeBytes.toString(),
    }));
  }

  async ownerMediaDownload(userId: string, eventId: string, mediaId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, ownerUserId: userId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');
    return this.getMediaObject(eventId, mediaId, userId);
  }

  private async getMediaObject(eventId: string, mediaId: string, userId?: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: mediaId,
        eventId,
        status: StoredFileStatus.READY,
        deletedAt: null,
        ...(userId ? { userId } : {}),
      },
      select: { objectKey: true, originalName: true, mimeType: true },
    });
    if (!file) throw new NotFoundException('Media not found');
    try {
      const object = await this.objects.get(file.objectKey);
      return { ...object, name: file.originalName, contentType: file.mimeType };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('File storage is temporarily unavailable.');
    }
  }
}
