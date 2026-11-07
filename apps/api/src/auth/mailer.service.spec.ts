jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    warn() {}
    error() {}
  },
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

describe('MailerService local console delivery', () => {
  const originalEnvironment = { ...process.env };
  let mailer: MailerService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_DELIVERY = 'console';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM;
    process.env.FRONTEND_URL = 'http://localhost:5174';
    mailer = new MailerService();
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('accepts local registrations without SMTP and logs a verification link', async () => {
    expect(mailer.isConfigured()).toBe(true);

    await mailer.sendVerification('person@example.com', 'verification-token');

    expect(warnSpy).toHaveBeenCalledWith(
      '[local email] Verify your IMARA email for person@example.com: http://localhost:5174/verify-email?token=verification-token',
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends verification codes over SMTP', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_DELIVERY = 'smtp';
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASSWORD = 'smtp-password';
    process.env.SMTP_FROM = 'IMARA <noreply@example.com>';
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    await mailer.sendVerificationCode('person@example.com', '123456');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'IMARA <noreply@example.com>',
      to: 'person@example.com',
      subject: 'Your IMARA verification code',
      text: expect.stringContaining('123456'),
    }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs SMTP delivery failures and rethrows them', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_DELIVERY = 'smtp';
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASSWORD = 'smtp-password';
    process.env.SMTP_FROM = 'IMARA <noreply@example.com>';
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const smtpError = new Error('SMTP authentication failed');
    const sendMail = jest.fn().mockRejectedValue(smtpError);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    await expect(mailer.sendVerificationCode('person@example.com', '123456')).rejects.toBe(smtpError);

    expect(errorSpy).toHaveBeenCalledWith('SMTP delivery failed: SMTP authentication failed');
  });

  it('sends password reset codes over SMTP', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_DELIVERY = 'smtp';
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASSWORD = 'smtp-password';
    process.env.SMTP_FROM = 'IMARA <noreply@example.com>';
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    await mailer.sendPasswordResetCode('person@example.com', '654321');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'person@example.com',
      subject: 'Your IMARA password reset code',
      text: expect.stringContaining('654321'),
    }));
  });

  it('logs password-reset and workspace-invitation links for local tests', async () => {
    await mailer.sendPasswordReset('person@example.com', 'reset-token');
    await mailer.sendWorkspaceInvitation('person@example.com', 'invite-token', 'Research Team');

    expect(warnSpy).toHaveBeenCalledWith(
      '[local email] Reset your IMARA password for person@example.com: http://localhost:5174/reset-password?token=reset-token',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[local email] Invitation to join Research Team on IMARA for person@example.com: http://localhost:5174/workspace/invitations/accept?token=invite-token',
    );
  });

  it('sends workspace invitations through Brevo SMTP when configured, even in local console mode', async () => {
    process.env.SMTP_HOST = 'smtp-relay.brevo.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASSWORD = 'smtp-password';
    process.env.SMTP_FROM = 'IMARA <noreply@example.com>';
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    await mailer.sendWorkspaceInvitation('person@example.com', 'invite-token', 'Research Team');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp-relay.brevo.com',
      port: 587,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'IMARA <noreply@example.com>',
      to: 'person@example.com',
      subject: 'Invitation to join Research Team on IMARA',
      text: expect.stringContaining('http://localhost:5174/workspace/invitations/accept?token=invite-token'),
    }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not allow console delivery in production', () => {
    process.env.NODE_ENV = 'production';

    expect(mailer.isConfigured()).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('uses SMTP when configured even when local console delivery is disabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASSWORD = 'smtp-password';
    process.env.SMTP_FROM = 'IMARA <noreply@example.com>';
    const sendMail = jest.fn().mockResolvedValue(undefined);
    jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    expect(mailer.isConfigured()).toBe(true);
    await mailer.sendVerification('person@example.com', 'verification-token');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'person@example.com',
      subject: 'Verify your IMARA email',
      text: expect.stringContaining('http://localhost:5174/verify-email?token=verification-token'),
    }));
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
