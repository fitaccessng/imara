jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  class MockLogger {
    error() {}
  }
  return {
    Injectable: () => (target: unknown) => target,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    Logger: MockLogger,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
    UnauthorizedException: MockHttpException,
  };
});

jest.mock('./password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from './mailer.service';
import { hashPassword, verifyPassword } from './password';
import { hashToken } from './token';
const planService = {
  getPlan: jest.fn(async (plan: unknown, client: any) => (
    client.planCatalogue.findUnique({ where: { plan } })
  )),
  getEntitlements: jest.fn(),
  requireFeature: jest.fn(),
};

describe('registration and login', () => {
  const user = {
    id: 'user-id',
    email: 'person@example.com',
    name: 'Person Example',
    role: 'USER',
    accountStatus: 'ACTIVE',
    passwordHash: 'stored-hash',
    emailVerifiedAt: new Date('2026-11-01T10:00:00.000Z'),
  };
  const userFindUnique = jest.fn();
  const sessionCreate = jest.fn();
  const accountLock = jest.fn();
  const workspaceFindFirst = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    session: { create: sessionCreate },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      user: { updateMany: accountLock },
      session: { create: sessionCreate },
      workspaceMember: { findFirst: workspaceFindFirst },
    })),
  } as unknown as PrismaService;
  const service = new AuthService(
    prisma,
    { isLocalConsoleMode: () => false } as unknown as MailerService,
    planService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a server-side session with only a token digest after verified credentials', async () => {
    userFindUnique.mockResolvedValue(user);
    accountLock.mockResolvedValue({ count: 1 });
    sessionCreate.mockResolvedValue({ id: 'session-id' });
    workspaceFindFirst.mockResolvedValue({ workspaceId: 'workspace-id' });
    jest.mocked(verifyPassword).mockResolvedValue(true);

    const result = await service.login(' PERSON@example.com ', 'correct password', 'Browser/1');

    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: true,
    });
    expect(result.workspaceId).toBe('workspace-id');
    expect(sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: hashToken(result.token),
        userAgent: 'Browser/1',
      }),
    });
    expect(sessionCreate.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
    expect(accountLock).toHaveBeenCalledWith({
      where: { id: user.id, accountStatus: 'ACTIVE' },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('rejects invalid credentials and unverified accounts without creating sessions', async () => {
    userFindUnique.mockResolvedValue(user);
    jest.mocked(verifyPassword).mockResolvedValue(false);
    await expect(service.login(user.email, 'wrong password')).rejects.toBeInstanceOf(UnauthorizedException);

    jest.mocked(verifyPassword).mockResolvedValue(true);
    userFindUnique.mockResolvedValue({ ...user, emailVerifiedAt: null });
    await expect(service.login(user.email, 'correct password')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('rejects suspended accounts and a suspension racing with session creation', async () => {
    userFindUnique.mockResolvedValue({ ...user, accountStatus: 'SUSPENDED' });
    jest.mocked(verifyPassword).mockResolvedValue(true);
    await expect(service.login(user.email, 'correct password'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionCreate).not.toHaveBeenCalled();

    userFindUnique.mockResolvedValue(user);
    accountLock.mockResolvedValue({ count: 0 });
    await expect(service.login(user.email, 'correct password'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('allows existing unverified accounts to sign in only in local console mode', async () => {
    userFindUnique.mockResolvedValue({ ...user, emailVerifiedAt: null });
    accountLock.mockResolvedValue({ count: 1 });
    sessionCreate.mockResolvedValue({ id: 'local-session-id' });
    workspaceFindFirst.mockResolvedValue(null);
    jest.mocked(verifyPassword).mockResolvedValue(true);
    const localService = new AuthService(
      prisma,
      { isLocalConsoleMode: () => true } as unknown as MailerService,
      planService as never,
    );

    const result = await localService.login(user.email, 'correct password');

    expect(result.user.emailVerified).toBe(false);
    expect(result.workspaceId).toBeNull();
    expect(sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: user.id }),
    });
  });

  it('refuses registration until SMTP is configured', async () => {
    const unconfiguredMailer = { isConfigured: () => false } as unknown as MailerService;
    const transaction = jest.fn();
    const noDatabaseWrites = { $transaction: transaction } as unknown as PrismaService;
    const registrationService = new AuthService(noDatabaseWrites, unconfiguredMailer, planService as never);

    await expect(registrationService.register({
      email: user.email,
      password: 'a sufficiently long password',
      name: user.name,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('marks accounts verified without sending verification email in local console mode', async () => {
    const userCreate = jest.fn().mockImplementation(({ data }) => ({
      ...data,
      id: user.id,
      emailVerifiedAt: data.emailVerifiedAt,
    }));
    const transaction = jest.fn(async (
      callback: (tx: {
        user: { create: typeof userCreate };
        planCatalogue: { findUnique: jest.Mock };
      }) => Promise<unknown>,
    ) => callback({
      user: { create: userCreate },
      planCatalogue: {
        findUnique: jest.fn().mockResolvedValue({ storageLimitBytes: 12_345n }),
      },
    }));
    const localMailer = {
      isConfigured: () => true,
      isLocalConsoleMode: () => true,
      sendVerification: jest.fn(),
    } as unknown as MailerService;
    const registrationService = new AuthService(
      { $transaction: transaction } as unknown as PrismaService,
      localMailer,
      planService as never,
    );
    jest.mocked(hashPassword).mockResolvedValue('stored-hash');

    const result = await registrationService.register({
      email: user.email,
      password: 'a sufficiently long password',
      name: user.name,
    });

    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        emailVerifiedAt: expect.any(Date),
        subscription: {
          create: {
            plan: 'FREE',
            storageLimitBytes: 12_345n,
            storageUsedBytes: 0n,
          },
        },
      }),
    }));
    expect(result.emailVerified).toBe(true);
    expect(localMailer.sendVerification).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000 });
  });

  it('returns registration while verification email delivery is still pending', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      ...user,
      emailVerifiedAt: null,
    });
    const tx = {
      user: { create: userCreate },
      planCatalogue: {
        findUnique: jest.fn().mockResolvedValue({ storageLimitBytes: 12_345n }),
      },
    };
    const verificationToken = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    };
    const transaction = jest.fn((operation: unknown) => {
      if (typeof operation === 'function') return operation(tx);
      return Promise.all(operation as Promise<unknown>[]);
    });
    const sendVerificationCode = jest.fn(() => new Promise<void>(() => {}));
    const registrationService = new AuthService(
      { $transaction: transaction, verificationToken } as unknown as PrismaService,
      {
        isConfigured: () => true,
        isLocalConsoleMode: () => false,
        sendVerificationCode,
      } as unknown as MailerService,
      planService as never,
    );
    jest.mocked(hashPassword).mockResolvedValue('stored-hash');

    await expect(registrationService.register({
      email: user.email,
      password: 'a sufficiently long password',
      name: user.name,
    })).resolves.toMatchObject({ emailVerified: false });

    expect(sendVerificationCode).toHaveBeenCalledWith(user.email, expect.stringMatching(/^\d{6}$/));
  });

  it('returns a retryable response when the database cannot start a registration transaction', async () => {
    const transactionError = new Prisma.PrismaClientKnownRequestError(
      'Transaction API error: Unable to start a transaction in the given time.',
      { code: 'P2028', clientVersion: '7.10.1' },
    );
    const transaction = jest.fn().mockRejectedValue(transactionError);
    const registrationService = new AuthService(
      { $transaction: transaction } as unknown as PrismaService,
      {
        isConfigured: () => true,
        isLocalConsoleMode: () => false,
      } as unknown as MailerService,
      planService as never,
    );
    jest.mocked(hashPassword).mockResolvedValue('stored-hash');

    await expect(registrationService.register({
      email: user.email,
      password: 'a sufficiently long password',
      name: user.name,
    })).rejects.toMatchObject({
      message: 'Account creation is temporarily busy. Please try again in a moment.',
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000 });
  });
});

describe('session management', () => {
  const createdAt = new Date('2026-11-01T10:00:00.000Z');
  const lastSeenAt = new Date('2026-11-06T00:00:00.000Z');
  const sessionFindMany = jest.fn();
  const sessionUpdateMany = jest.fn();
  const service = new AuthService(
    { session: { findMany: sessionFindMany, updateMany: sessionUpdateMany } } as unknown as PrismaService,
    {} as MailerService,
    planService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns only active owned sessions with current, timestamps and optional user agent', async () => {
    sessionFindMany.mockResolvedValue([
      { id: 'current-id', createdAt, lastSeenAt, userAgent: 'Browser/1' },
      { id: 'other-id', createdAt, lastSeenAt, userAgent: null },
    ]);

    await expect(service.listSessions('owner-id', 'current-id')).resolves.toEqual({
      sessions: [
        { id: 'current-id', current: true, createdAt, lastSeenAt, userAgent: 'Browser/1' },
        { id: 'other-id', current: false, createdAt, lastSeenAt },
      ],
    });

    expect(sessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'owner-id', revokedAt: null }),
    }));
  });

  it('scopes revocation to the owner and returns not-found for another user session', async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.revokeSession('owner-id', 'someone-elses-session'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses-session', userId: 'owner-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  describe('email OTP verification', () => {
    const userFindUnique = jest.fn();
    const tokenFindFirst = jest.fn();
    const tokenUpdateMany = jest.fn();
    const tokenDeleteMany = jest.fn();
    const userUpdate = jest.fn();
    const txClient = {
      verificationToken: {
        findFirst: tokenFindFirst,
        updateMany: tokenUpdateMany,
        deleteMany: tokenDeleteMany,
      },
      user: { update: userUpdate },
    };
    const transaction = jest.fn(async (callback: (tx: typeof txClient) => Promise<unknown>) => callback(txClient));
    const service = new AuthService(
      {
        user: { findUnique: userFindUnique },
        $transaction: transaction,
      } as unknown as PrismaService,
      {} as MailerService,
      planService as never,
    );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('sends verification code to a specific unverified account', async () => {
      const sendVerificationCode = jest.fn().mockResolvedValue(undefined);
      const create = jest.fn().mockResolvedValue({});
      const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
      const sendService = new AuthService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'user-id',
              email: 'person@example.com',
              emailVerifiedAt: null,
            }),
          },
          verificationToken: { create, deleteMany },
          $transaction: jest.fn().mockResolvedValue([]),
        } as unknown as PrismaService,
        {
          isConfigured: () => true,
          sendVerificationCode,
        } as unknown as MailerService,
        planService as never,
      );

      await expect(sendService.resendVerificationForUser('user-id')).resolves.toBe(true);
      expect(sendVerificationCode).toHaveBeenCalledWith(
        'person@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-id', expiresAt: expect.any(Date) }),
      });
    });

    it('consumes a valid code and marks the matching user verified', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-id', emailVerifiedAt: null });
      tokenFindFirst.mockResolvedValue({ id: 'verification-id', tokenHash: hashToken('user-id:123456') });
      tokenDeleteMany.mockResolvedValue({ count: 1 });

      await service.verifyEmailCode(' PERSON@example.com ', '123456');

      expect(userFindUnique).toHaveBeenCalledWith({
        where: { email: 'person@example.com' },
        select: { id: true, emailVerifiedAt: true },
      });
      expect(tokenFindFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-id', failedAttempts: { lt: 5 } }),
      }));
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('increments the failed-attempt count for an incorrect code', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-id', emailVerifiedAt: null });
      tokenFindFirst.mockResolvedValue({ id: 'verification-id', tokenHash: hashToken('user-id:123456') });
      tokenUpdateMany.mockResolvedValue({ count: 1 });

      await expect(service.verifyEmailCode('person@example.com', '654321'))
        .rejects.toBeInstanceOf(UnauthorizedException);

      expect(tokenUpdateMany).toHaveBeenCalledWith({
        where: { id: 'verification-id', failedAttempts: { lt: 5 }, expiresAt: { gt: expect.any(Date) } },
        data: { failedAttempts: { increment: 1 } },
      });
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('password reset OTP', () => {
    const userFindUnique = jest.fn();
    const tokenFindFirst = jest.fn();
    const tokenUpdateMany = jest.fn();
    const tokenDeleteMany = jest.fn();
    const userUpdate = jest.fn();
    const sessionUpdateMany = jest.fn();
    const txClient = {
      passwordResetToken: { deleteMany: tokenDeleteMany },
      user: { update: userUpdate },
      session: { updateMany: sessionUpdateMany },
    };
    const transaction = jest.fn(async (callback: (tx: typeof txClient) => Promise<unknown>) => callback(txClient));
    const service = new AuthService(
      {
        user: { findUnique: userFindUnique },
        passwordResetToken: {
          findFirst: tokenFindFirst,
          updateMany: tokenUpdateMany,
        },
        $transaction: transaction,
      } as unknown as PrismaService,
      {} as MailerService,
      planService as never,
    );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('changes the password, consumes the reset code, and revokes sessions', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      tokenFindFirst.mockResolvedValue({ id: 'reset-id', tokenHash: hashToken('user-id:123456') });
      tokenDeleteMany.mockResolvedValue({ count: 1 });
      jest.mocked(hashPassword).mockResolvedValue('new-password-hash');

      await service.resetPasswordWithCode(' PERSON@example.com ', '123456', 'a sufficiently long password');

      expect(tokenFindFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-id', failedAttempts: { lt: 5 } }),
      }));
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { passwordHash: 'new-password-hash' },
      });
      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'user-id', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('increments attempts and rejects an incorrect reset code', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-id' });
      tokenFindFirst.mockResolvedValue({ id: 'reset-id', tokenHash: hashToken('user-id:123456') });

      await expect(service.resetPasswordWithCode('person@example.com', '654321', 'a sufficiently long password'))
        .rejects.toBeInstanceOf(UnauthorizedException);

      expect(tokenUpdateMany).toHaveBeenCalledWith({
        where: { id: 'reset-id', failedAttempts: { lt: 5 }, expiresAt: { gt: expect.any(Date) } },
        data: { failedAttempts: { increment: 1 } },
      });
      expect(hashPassword).not.toHaveBeenCalled();
    });

    it('creates and emails a six-digit reset code for a known account', async () => {
      const resetTokenCreate = jest.fn().mockResolvedValue({});
      const resetTokenDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
      const resetTransaction = jest.fn().mockResolvedValue([]);
      const sendPasswordResetCode = jest.fn().mockResolvedValue(undefined);
      const resetService = new AuthService(
        {
          user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-id', email: 'person@example.com' }) },
          passwordResetToken: {
            create: resetTokenCreate,
            deleteMany: resetTokenDeleteMany,
          },
          $transaction: resetTransaction,
        } as unknown as PrismaService,
        {
          isConfigured: () => true,
          sendPasswordResetCode,
        } as unknown as MailerService,
        planService as never,
      );

      await resetService.requestPasswordReset(' PERSON@example.com ');

      const sentCode = sendPasswordResetCode.mock.calls[0][1] as string;
      expect(sentCode).toMatch(/^\d{6}$/);
      expect(sendPasswordResetCode).toHaveBeenCalledWith('person@example.com', sentCode);
      expect(resetTokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-id',
          tokenHash: hashToken(`user-id:${sentCode}`),
          expiresAt: expect.any(Date),
        }),
      });
      expect(resetTransaction).toHaveBeenCalledTimes(1);
    });

    it('sends an audited-admin-requested reset code by customer id', async () => {
      const userFindUniqueById = jest.fn().mockResolvedValue({
        id: 'user-id',
        email: 'person@example.com',
      });
      const sendPasswordResetCode = jest.fn().mockResolvedValue(undefined);
      const resetService = new AuthService(
        {
          user: { findUnique: userFindUniqueById },
          passwordResetToken: {
            create: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          $transaction: jest.fn().mockResolvedValue([]),
        } as unknown as PrismaService,
        {
          isConfigured: () => true,
          sendPasswordResetCode,
        } as unknown as MailerService,
        planService as never,
      );

      await resetService.requestPasswordResetForUser('user-id');

      expect(userFindUniqueById).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        select: { id: true, email: true },
      });
      expect(sendPasswordResetCode).toHaveBeenCalledWith(
        'person@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });
});
