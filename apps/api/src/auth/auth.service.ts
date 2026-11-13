import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  Plan,
  Prisma,
  StoredFileStatus,
  UserAccountStatus,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';
import { hashPassword, verifyPassword } from './password';
import { createOpaqueToken, hashToken } from './token';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { serializePlanEntitlements } from '../subscriptions/plan-entitlements';
import { creditVerifiedReferral } from '../referrals/referrals.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly plans: PlanCatalogueService,
  ) {}

  private requireMailer() {
    if (!this.mailer.isConfigured()) {
      throw new ServiceUnavailableException(
        'Email delivery is unavailable. Configure the SMTP environment variables before using this flow.',
      );
    }
  }

  private async createEmailToken(userId: string, type: 'verify' | 'reset') {
    const raw = type === 'verify' || type === 'reset'
      ? randomInt(100_000, 1_000_000).toString()
      : createOpaqueToken();
    const expiresMinutes = Number(
      type === 'verify' || type === 'reset'
        ? process.env.EMAIL_OTP_TTL_MINUTES ?? 10
        : process.env.PASSWORD_RESET_TTL_MINUTES ?? 30,
    );
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);
    const tokenHash = /^\d{6}$/.test(raw) ? hashToken(`${userId}:${raw}`) : hashToken(raw);
    if (type === 'verify') {
      await this.prisma.$transaction([
        this.prisma.verificationToken.deleteMany({ where: { userId } }),
        this.prisma.verificationToken.create({ data: { userId, tokenHash, expiresAt } }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
        this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
      ]);
    }
    return raw;
  }

  async register(input: {
    email: string; password: string; name: string; accountType?: 'PERSONAL' | 'BUSINESS';
    workspaceName?: string; referralCode?: string;
  }) {
    this.requireMailer();
    const skipEmailVerification = this.mailer.isLocalConsoleMode();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const freePlan = await this.plans.getPlan(Plan.FREE, tx);
        const inviter = input.referralCode
          ? await tx.user.findUnique({
            where: { referralCode: input.referralCode.trim().toUpperCase() },
            select: { id: true },
          })
          : null;
        if (input.referralCode && !inviter) {
          throw new BadRequestException('Referral code is invalid');
        }
        const created = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash,
            referralCode: randomUUID().replace(/-/g, '').toUpperCase(),
            ...(inviter ? { referredByUserId: inviter.id } : {}),
            ...(skipEmailVerification ? { emailVerifiedAt: new Date() } : {}),
            subscription: {
              create: {
                plan: Plan.FREE,
                storageLimitBytes: freePlan.storageLimitBytes,
                storageUsedBytes: 0n,
              },
            },
          },
        });
        if (skipEmailVerification && inviter) {
          await creditVerifiedReferral(tx, inviter.id);
        }
        if (input.accountType === 'BUSINESS') {
          const workspaceName = input.workspaceName?.replace(/[\u0000-\u001f\u007f]/g, '').trim()
            || `${input.name.trim().replace(/[\u0000-\u001f\u007f]/g, '')}'s workspace`;
          const workspace = await tx.workspace.create({
            data: {
              name: workspaceName,
              ownerUserId: created.id,
              storageLimitBytes: freePlan.storageLimitBytes,
            },
          });
          await tx.workspaceMember.create({
            data: {
              workspaceId: workspace.id, userId: created.id,
              role: WorkspaceRole.OWNER, status: WorkspaceMemberStatus.ACTIVE,
            },
          });
          await tx.auditLog.create({
            data: { workspaceId: workspace.id, actorId: created.id, action: 'WORKSPACE_CREATED', targetType: 'Workspace', targetId: workspace.id },
          });
          return { user: created, workspaceId: workspace.id };
        }
        return { user: created, workspaceId: null };
      }, { maxWait: 10_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
        throw new ServiceUnavailableException('Account creation is temporarily busy. Please try again in a moment.');
      }
      throw error;
    }
    if (!skipEmailVerification) {
      const code = await this.createEmailToken(user.user.id, 'verify');
      void this.mailer.sendVerificationCode(email, code).catch(() => {
        this.logger.error('Verification email delivery failed after account creation; retry from the verification page.');
      });
    }
    return {
      id: user.user.id, email: user.user.email, name: user.user.name, emailVerified: skipEmailVerification,
      ...(user.workspaceId ? { workspaceId: user.workspaceId } : {}),
    };
  }

  async resendVerification(emailInput: string): Promise<void> {
    this.requireMailer();
    const user = await this.prisma.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
    // Keep unknown and already verified addresses indistinguishable.
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerificationCode(user);
  }

  async resendVerificationForUser(userId: string): Promise<boolean> {
    this.requireMailer();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('Customer not found');
    if (user.emailVerifiedAt) return false;
    await this.sendVerificationCode(user);
    return true;
  }

  private async sendVerificationCode(user: { id: string; email: string }): Promise<void> {
    const code = await this.createEmailToken(user.id, 'verify');
    try {
      await this.mailer.sendVerificationCode(user.email, code);
    } catch {
      throw new ServiceUnavailableException('Verification email could not be delivered.');
    }
  }

  async verifyEmail(rawToken: string, userAgent?: string) {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (!record || record.expiresAt <= new Date()) throw new UnauthorizedException('Verification token is invalid or expired');
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationToken.deleteMany({
        where: { tokenHash, userId: record.userId, expiresAt: { gt: new Date() } },
      });
      if (!consumed.count) throw new UnauthorizedException('Verification token is invalid or expired');
      const verifiedUser = await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await creditVerifiedReferral(tx, verifiedUser?.referredByUserId);
      await tx.verificationToken.deleteMany({ where: { userId: record.userId } });
    });
    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true, accountStatus: true },
    });
    if (!user || !user.emailVerifiedAt) throw new UnauthorizedException('Verification token is invalid or expired');
    return this.createSession(user, userAgent);
  }

  async verifyEmailCode(emailInput: string, code: string, userAgent?: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true, accountStatus: true },
    });
    if (!user || user.emailVerifiedAt) {
      throw new UnauthorizedException('Verification code is invalid or expired');
    }

    const tokenHash = hashToken(`${user.id}:${code}`);
    const now = new Date();
    const verified = await this.prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findFirst({
        where: {
          userId: user.id,
          expiresAt: { gt: now },
          failedAttempts: { lt: 5 },
        },
      });

      if (!record) return false;
      if (record.tokenHash !== tokenHash) {
        await tx.verificationToken.updateMany({
          where: { id: record.id, failedAttempts: { lt: 5 }, expiresAt: { gt: now } },
          data: { failedAttempts: { increment: 1 } },
        });
        return false;
      }

      const consumed = await tx.verificationToken.deleteMany({
        where: { id: record.id, expiresAt: { gt: now }, failedAttempts: { lt: 5 } },
      });
      if (!consumed.count) return false;
      const verifiedUser = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
      await creditVerifiedReferral(tx, verifiedUser?.referredByUserId);
      await tx.verificationToken.deleteMany({ where: { userId: user.id } });
      return true;
    });

    if (!verified) throw new UnauthorizedException('Verification code is invalid or expired');
    return this.createSession({ ...user, emailVerifiedAt: now }, userAgent);
  }

  async login(emailInput: string, password: string, userAgent?: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = user
      ? await verifyPassword(user.passwordHash, password)
      : false;
    if (
      !user
      || !passwordMatches
      || user.accountStatus !== UserAccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (!user.emailVerifiedAt && !this.mailer.isLocalConsoleMode()) {
      throw new ForbiddenException('Verify your email before signing in');
    }
    return this.createSession(user, userAgent);
  }

  private async createSession(
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      emailVerifiedAt: Date | null;
      accountStatus: UserAccountStatus;
    },
    userAgent?: string,
  ) {
    const rawToken = createOpaqueToken();
    const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? 30);
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    const session = await this.prisma.$transaction(async (tx) => {
      // Take a write lock on the account row so that a concurrent suspension
      // either precedes this check or waits and revokes the newly-created session.
      const activeAccount = await tx.user.updateMany({
        where: { id: user.id, accountStatus: UserAccountStatus.ACTIVE },
        data: { updatedAt: new Date() },
      });
      if (!activeAccount.count) {
        throw new UnauthorizedException('Email or password is incorrect');
      }
      const [session, workspace] = await Promise.all([
        tx.session.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt,
            userAgent: userAgent?.slice(0, 512) ?? null,
          },
        }),
        tx.workspaceMember.findFirst({
          where: { userId: user.id, status: WorkspaceMemberStatus.ACTIVE },
          orderBy: { joinedAt: 'asc' },
          select: { workspaceId: true },
        }),
      ]);
      return { session, workspaceId: workspace?.workspaceId ?? null };
    });
    return {
      token: rawToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      sessionId: session.session.id,
      workspaceId: session.workspaceId,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    this.requireMailer();
    const user = await this.prisma.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
    if (!user) return;
    await this.sendPasswordResetCode(user);
  }

  async requestPasswordResetForUser(userId: string): Promise<void> {
    this.requireMailer();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Customer not found');
    await this.sendPasswordResetCode(user);
  }

  private async sendPasswordResetCode(user: { id: string; email: string }): Promise<void> {
    const code = await this.createEmailToken(user.id, 'reset');
    try {
      await this.mailer.sendPasswordResetCode(user.email, code);
    } catch {
      throw new ServiceUnavailableException('Password reset email could not be delivered.');
    }
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.expiresAt <= new Date()) throw new UnauthorizedException('Reset token is invalid or expired');
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.deleteMany({
        where: { tokenHash, userId: record.userId, expiresAt: { gt: new Date() } },
      });
      if (!consumed.count) throw new UnauthorizedException('Reset token is invalid or expired');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  async resetPasswordWithCode(emailInput: string, code: string, password: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Reset code is invalid or expired');

    const now = new Date();
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, expiresAt: { gt: now }, failedAttempts: { lt: 5 } },
    });
    if (!record) throw new UnauthorizedException('Reset code is invalid or expired');

    if (record.tokenHash !== hashToken(`${user.id}:${code}`)) {
      await this.prisma.passwordResetToken.updateMany({
        where: { id: record.id, failedAttempts: { lt: 5 }, expiresAt: { gt: now } },
        data: { failedAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Reset code is invalid or expired');
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.deleteMany({
        where: { id: record.id, expiresAt: { gt: new Date() }, failedAttempts: { lt: 5 } },
      });
      if (!consumed.count) throw new UnauthorizedException('Reset code is invalid or expired');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true, createdAt: true },
    });
    return { ...user, emailVerified: Boolean(user.emailVerifiedAt), emailVerifiedAt: undefined };
  }

  async updateProfile(userId: string, name: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    return { id: user.id, email: user.email, name: user.name, emailVerified: Boolean(user.emailVerifiedAt) };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true },
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        current: session.id === currentSessionId,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Session not found');
  }

  async getSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({ where: { userId } });
    const plan = await this.plans.currentPlan(subscription);
    const entitlements = await this.plans.getEntitlements(plan);
    return {
      plan: plan.toLowerCase(),
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      autoRenew: false,
      entitlements: serializePlanEntitlements(entitlements),
      storage: {
        usedBytes: subscription.storageUsedBytes.toString(),
        reservedBytes: subscription.storageReservedBytes.toString(),
        limitBytes: entitlements.storageLimitBytes.toString(),
        maxUploadBytes: entitlements.maxUploadBytes.toString(),
        availableBytes: (
          entitlements.storageLimitBytes
          - subscription.storageUsedBytes
          - subscription.storageReservedBytes
        ).toString(),
      },
    };
  }

  async getDashboard(userId: string) {
    const [user, subscription, documentsCount, recentActivity] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, emailVerifiedAt: true },
      }),
      this.getSubscription(userId),
      this.prisma.storedFile.count({ where: { userId, status: StoredFileStatus.READY, deletedAt: null } }),
      this.prisma.storedFile.findMany({
        where: { userId, status: StoredFileStatus.READY, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      }),
    ]);
    return {
      user: { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerifiedAt) },
      subscription,
      overview: {
        documentsCount,
        recentActivity: recentActivity.map((file) => ({
          id: file.id,
          name: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes.toString(),
          createdAt: file.createdAt,
        })),
      },
    };
  }
}
