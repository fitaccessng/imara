jest.mock('@nestjs/common', () => ({
  BadRequestException: class BadRequestException extends Error {},
  Injectable: () => (target: unknown) => target,
  NotFoundException: class NotFoundException extends Error {},
}));

import {
  creditVerifiedReferral,
  REFERRAL_STORAGE_REWARD_BYTES,
  ReferralsService,
} from './referrals.service';

describe('verified referral storage rewards', () => {
  function makeTransaction(verifiedCount: number, insertedRewards = 0) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { count: jest.fn().mockResolvedValue(verifiedCount) },
      referralReward: { createMany: jest.fn().mockResolvedValue({ count: insertedRewards }) },
      subscription: { update: jest.fn().mockResolvedValue({}) },
    };
    return tx;
  }

  it('does not reward until five invited accounts have verified', async () => {
    const tx = makeTransaction(4);
    await creditVerifiedReferral(tx as never, 'inviter-id');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.count).toHaveBeenCalledWith({
      where: { referredByUserId: 'inviter-id', emailVerifiedAt: { not: null } },
    });
    expect(tx.referralReward.createMany).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('awards a GiB for each complete five-verified-referral milestone', async () => {
    const tx = makeTransaction(12, 2);
    await creditVerifiedReferral(tx as never, 'inviter-id');

    expect(tx.referralReward.createMany).toHaveBeenCalledWith({
      data: [
        { inviterUserId: 'inviter-id', verifiedReferralCount: 5, storageBytes: REFERRAL_STORAGE_REWARD_BYTES },
        { inviterUserId: 'inviter-id', verifiedReferralCount: 10, storageBytes: REFERRAL_STORAGE_REWARD_BYTES },
      ],
      skipDuplicates: true,
    });
    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { userId: 'inviter-id' },
      data: { storageLimitBytes: { increment: 2n * REFERRAL_STORAGE_REWARD_BYTES } },
    });
  });

  it('is idempotent when all milestone rows already exist', async () => {
    const tx = makeTransaction(10, 0);
    await creditVerifiedReferral(tx as never, 'inviter-id');

    expect(tx.referralReward.createMany).toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it('does nothing for an account without a referrer', async () => {
    const tx = makeTransaction(0);
    await creditVerifiedReferral(tx as never, null);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps personal links available when the promo is inactive and reports verified reward progress', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          referralCode: 'ABCD1234',
        }),
        count: jest.fn().mockResolvedValue(5),
      },
      referralProgramConfig: {
        upsert: jest.fn().mockResolvedValue({
          active: false,
          title: 'Invite friends',
          message: 'Five referrals earn storage.',
          linkTemplate: 'https://example.test/join?ref={code}',
          copyInstructions: 'Copy and share this link.',
          updatedAt: new Date('2026-11-12T00:00:00Z'),
        }),
      },
      referralReward: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { storageBytes: REFERRAL_STORAGE_REWARD_BYTES } }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ReferralsService(prisma as never);

    await expect(service.summary('inviter-id')).resolves.toMatchObject({
      referralCode: 'ABCD1234',
      referralLink: 'https://example.test/join?ref=ABCD1234',
      verifiedReferrals: 5,
      rewardedMilestones: 1,
      nextRewardAt: 10,
      bonusStorageBytes: REFERRAL_STORAGE_REWARD_BYTES.toString(),
    });
    await expect(service.promotion()).resolves.toMatchObject({ enabled: false });
  });
});
