import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateReferralProgramDto } from './referrals.dto';

describe('UpdateReferralProgramDto', () => {
  it('accepts the admin modal fields and an optional link template', async () => {
    const dto = plainToInstance(UpdateReferralProgramDto, {
      enabled: true,
      title: 'Share IMARA',
      message: 'Invite a friend.',
      instructions: 'Copy the link and share it.',
      linkTemplate: 'https://example.test/register?ref={code}',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects link templates without a referral-code placeholder', async () => {
    const dto = plainToInstance(UpdateReferralProgramDto, {
      linkTemplate: 'https://example.test/register',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
