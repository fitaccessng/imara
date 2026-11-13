import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Plan } from '@prisma/client';
import { createOpaqueToken, hashToken } from '../auth/token';
import { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { getPlanMaxUploadBytes } from '../subscriptions/plan-entitlements';
import { StorageService, UploadInput } from './storage.service';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class FileRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly plans: PlanCatalogueService,
  ) {}

  async create(userId: string, input: { title: string; message?: string; destinationFolderId?: string }) {
    const token = createOpaqueToken();
    const request = await this.prisma.$transaction(async (tx) => {
      if (input.destinationFolderId) {
        const folder = await tx.folder.findFirst({
          where: { id: input.destinationFolderId, userId, workspaceId: null },
          select: { id: true },
        });
        if (!folder) throw new NotFoundException('Folder not found');
      }
      return tx.fileRequest.create({
        data: {
          creatorUserId: userId,
          folderId: input.destinationFolderId ?? null,
          tokenHash: hashToken(token),
          title: input.title,
          message: input.message?.trim() || null,
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
    });
    return {
      id: request.id,
      title: request.title,
      message: request.message,
      destinationFolderId: request.folderId,
      destinationFolderName: request.folder?.name ?? null,
      createdAt: request.createdAt,
      token,
      linkPath: `/request/${token}`,
    };
  }

  async list(userId: string) {
    const requests = await this.prisma.fileRequest.findMany({
      where: { creatorUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        message: true,
        folderId: true,
        folder: { select: { name: true } },
        createdAt: true,
        revokedAt: true,
        _count: {
          select: {
            uploads: {
              where: { status: 'READY', deletedAt: null },
            },
          },
        },
      },
    });
    return requests.map(({ folderId, folder, revokedAt, _count, ...request }) => ({
      ...request,
      destinationFolderId: folderId,
      destinationFolderName: folder?.name ?? null,
      uploadCount: _count.uploads,
      revokedAt,
      active: revokedAt === null,
    }));
  }

  async revoke(userId: string, id: string): Promise<void> {
    const revoked = await this.prisma.fileRequest.updateMany({
      where: { id, creatorUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count) return;
    const existing = await this.prisma.fileRequest.findFirst({
      where: { id, creatorUserId: userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('File request not found');
  }

  private async activeRequest(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('File request not found');
    const request = await this.prisma.fileRequest.findFirst({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null,
        creator: { accountStatus: 'ACTIVE' },
      },
      select: {
        id: true,
        title: true,
        folderId: true,
        creatorUserId: true,
        createdAt: true,
      },
    });
    if (!request) throw new NotFoundException('File request not found');
    return request;
  }

  async getPublicMetadata(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new NotFoundException('File request not found');
    const request = await this.prisma.fileRequest.findFirst({
      where: { tokenHash: hashToken(token) },
      select: {
        title: true,
        message: true,
        revokedAt: true,
        folder: { select: { name: true } },
        creator: {
          select: {
            name: true,
            accountStatus: true,
            subscription: {
              select: { id: true, userId: true, plan: true, currentPeriodEnd: true },
            },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('File request not found');
    const plan = request.creator.subscription
      ? await this.plans.currentPlan(request.creator.subscription)
      : Plan.FREE;
    return {
      title: request.title,
      message: request.message,
      ownerName: request.creator.name,
      destinationFolderName: request.folder?.name ?? null,
      maxUploadBytes: getPlanMaxUploadBytes(plan).toString(),
      active: request.revokedAt === null && request.creator.accountStatus === 'ACTIVE',
    };
  }

  async upload(token: string, file: UploadInput, relativePath?: string) {
    const request = await this.activeRequest(token);
    // StorageService owns all per-file, subscription entitlement, and quota checks.
    return this.storage.upload(
      request.creatorUserId,
      file,
      request.folderId ?? undefined,
      undefined,
      request.id,
      relativePath,
    );
  }
}
