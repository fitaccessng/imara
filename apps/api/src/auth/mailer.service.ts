import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  isLocalConsoleMode(): boolean {
    return process.env.EMAIL_DELIVERY === 'console' &&
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
  }

  private isSmtpConfigured(): boolean {
    return Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM,
    );
  }

  isConfigured(): boolean {
    return this.isLocalConsoleMode() || this.isSmtpConfigured();
  }

  private transporter() {
    if (!this.isSmtpConfigured()) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.',
      );
    }
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_SECURE !== 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }

  private async deliver(to: string, subject: string, text: string, url: URL, preferSmtp = false): Promise<void> {
    if (this.isLocalConsoleMode() && (!preferSmtp || !this.isSmtpConfigured())) {
      this.logger.warn(`[local email] ${subject} for ${to}: ${url.toString()}`);
      return;
    }
    await this.transporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  }

  async sendVerification(to: string, token: string): Promise<void> {
    const url = new URL('/verify-email', process.env.FRONTEND_URL ?? 'http://localhost:5173');
    url.searchParams.set('token', token);
    await this.deliver(to, 'Verify your IMARA email', `Verify your email using this link: ${url.toString()}`, url);
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const subject = 'Your IMARA verification code';
    const text = `Your IMARA email verification code is ${code}.\n\nThis code expires in ${process.env.EMAIL_OTP_TTL_MINUTES ?? 10} minutes. If you did not create an IMARA account, you can ignore this email.`;
    if (this.isLocalConsoleMode()) {
      this.logger.warn(`[local email] ${subject} for ${to}: ${code}`);
      return;
    }
    await this.transporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = new URL('/reset-password', process.env.FRONTEND_URL ?? 'http://localhost:5173');
    url.searchParams.set('token', token);
    await this.deliver(to, 'Reset your IMARA password', `Reset your password using this link: ${url.toString()}`, url);
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const subject = 'Your IMARA password reset code';
    const text = `Your IMARA password reset code is ${code}.\n\nThis code expires in ${process.env.EMAIL_OTP_TTL_MINUTES ?? 10} minutes. If you did not request a password reset, you can ignore this email.`;
    if (this.isLocalConsoleMode()) {
      this.logger.warn(`[local email] ${subject} for ${to}: ${code}`);
      return;
    }
    await this.transporter().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  }

  async sendWorkspaceInvitation(to: string, token: string, workspaceName: string): Promise<void> {
    const safeWorkspaceName = workspaceName.replace(/[\r\n\u0000-\u001f\u007f]/g, '').slice(0, 160);
    const url = new URL('/workspace/invitations/accept', process.env.FRONTEND_URL ?? 'http://localhost:5173');
    url.searchParams.set('token', token);
    const subject = `Invitation to join ${safeWorkspaceName} on IMARA`;
    const text = `You have been invited to join ${safeWorkspaceName} on IMARA. Sign in or create an account using this email address, then accept the invitation: ${url.toString()}`;
    await this.deliver(to, subject, text, url, true);
  }
}
