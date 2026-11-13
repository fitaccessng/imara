import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlatformAdminRequest } from '../admin/platform-admin.types';
import type { UpdateReferralProgramDto } from './referrals.dto';

export const REFERRAL_MILESTONE = 5;
export const REFERRAL_STORAGE_REWARD_BYTES = 1n * 1024n * 1024n * 1024n;

type ReferralTransaction = Prisma.TransactionClient;

/**
 * Called only after the referred user is marked verified, in that same transaction.
 * Serializing on the inviter's User row makes milestone counting safe when distinct
 * invited accounts verify concurrently.
 */
export async function creditVerifiedReferral(
  tx: ReferralTransaction,
  inviterUserId: string | null | undefined,
): Promise<void> {
  if (!inviterUserId) return;

  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${inviterUserId}::uuid FOR UPDATE`);
  const verifiedCount = await tx.user.count({
    where: { referredByUserId: inviterUserId, emailVerifiedAt: { not: null } },
  });
  const milestones = Math.floor(verifiedCount / REFERRAL_MILESTONE);
  if (milestones < 1) return;

  const rewards = Array.from({ length: milestones }, (_, index) => ({
    inviterUserId,
    verifiedReferralCount: (index + 1) * REFERRAL_MILESTONE,
    storageBytes: REFERRAL_STORAGE_REWARD_BYTES,
  }));
  const result = await tx.referralReward.createMany({ data: rewards, skipDuplicates: true });
  if (!result.count) return;

  // Rewards increase the personal subscription quota, never storage usage/reservations.
  await tx.subscription.update({
    where: { userId: inviterUserId },
    data: { storageLimitBytes: { increment: REFERRAL_STORAGE_REWARD_BYTES * BigInt(result.count) } },
  });
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  private async config() {
    return this.prisma.referralProgramConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  private formatConfig(config: {
    active: boolean;
    title: string;
    message: string;
    linkTemplate: string;
    copyInstructions: string;
    updatedAt: Date;
  }) {
    return {
      enabled: config.active,
      active: config.active,
      title: config.title,
      message: config.message,
      linkTemplate: config.linkTemplate,
      instructions: config.copyInstructions,
      updatedAt: config.updatedAt,
    };
  }

  async summary(userId: string) {
    const [user, config, verifiedReferrals, rewardAggregate, rewardedMilestones] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      }),
      this.config(),
      this.prisma.user.count({
        where: { referredByUserId: userId, emailVerifiedAt: { not: null } },
      }),
      this.prisma.referralReward.aggregate({
        where: { inviterUserId: userId },
        _sum: { storageBytes: true },
      }),
      this.prisma.referralReward.count({ where: { inviterUserId: userId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    const referralLink = config.linkTemplate.replaceAll('{code}', encodeURIComponent(user.referralCode));
    return {
      referralCode: user.referralCode,
      referralLink,
      verifiedReferrals,
      rewardedMilestones,
      nextRewardAt: (Math.floor(verifiedReferrals / REFERRAL_MILESTONE) + 1) * REFERRAL_MILESTONE,
      bonusStorageBytes: (rewardAggregate._sum.storageBytes ?? 0n).toString(),
    };
  }

  async getProgramConfig() {
    // Admins may also inspect/change the server-managed referral URL template.
    return this.formatConfig(await this.config());
  }

  async promotion() {
    const config = await this.config();
    return {
      enabled: config.active,
      title: config.title,
      message: config.message,
      instructions: config.copyInstructions,
      updatedAt: config.updatedAt,
    };
  }

  async updateProgramConfig(dto: UpdateReferralProgramDto, request: PlatformAdminRequest) {
    if (dto.linkTemplate !== undefined) {
      try {
        const url = new URL(dto.linkTemplate.replaceAll('{code}', 'REFERRALCODE'));
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
      } catch {
        throw new BadRequestException('Referral link template must be an absolute HTTP(S) URL');
      }
      if (!dto.linkTemplate.includes('{code}')) {
        throw new BadRequestException('The referral link template must contain {code}');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.referralProgramConfig.upsert({
        where: { id: 'default' },
        create: { id: 'default' },
        update: {},
      });
      const config = await tx.referralProgramConfig.update({
        where: { id: 'default' },
        data: {
          ...((dto.active !== undefined || dto.enabled !== undefined)
            && { active: dto.active ?? dto.enabled }),
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.message !== undefined && { message: dto.message.trim() }),
          ...(dto.linkTemplate !== undefined && { linkTemplate: dto.linkTemplate.trim() }),
          ...((dto.copyInstructions !== undefined || dto.instructions !== undefined)
            && { copyInstructions: (dto.copyInstructions ?? dto.instructions)!.trim() }),
        },
      });
      await tx.platformAdminAuditLog.create({
        data: {
          actorId: request.platformAdmin.id,
          action: 'admin.referrals.config.update',
          resourceType: 'referral-program',
          resourceId: 'default',
          ipAddress: request.ip,
          userAgent: request.get('user-agent') ?? undefined,
          metadata: {
            before: {
              active: current.active,
              title: current.title,
              message: current.message,
              linkTemplate: current.linkTemplate,
              copyInstructions: current.copyInstructions,
            },
            after: {
              active: config.active,
              title: config.title,
              message: config.message,
              linkTemplate: config.linkTemplate,
              copyInstructions: config.copyInstructions,
            },
          },
        },
      });
      return this.formatConfig(config);
    });
  }
}
