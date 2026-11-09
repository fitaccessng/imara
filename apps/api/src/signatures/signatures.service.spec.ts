import 'reflect-metadata';

jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    Logger: class {
      error() {}
      warn() {}
    },
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ApprovalReviewMode, SignatureMethod, SignatureSignerStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { SignaturesService } from './signatures.service';

describe('SignaturesService', () => {
  const userId = 'user-1';
  const workspaceId = 'workspace-1';
  const requestId = 'request-1';
  const signer = {
    id: 'signer-1',
    memberId: 'member-1',
    userId,
    displayName: 'Ada Lovelace',
    email: 'ada@example.test',
    order: 0,
    status: SignatureSignerStatus.PENDING,
    method: null,
    signedName: null,
    signedAt: null,
    consentedAt: null,
    declineReason: null,
  };
  const request = {
    id: requestId,
    workspaceId,
    mode: ApprovalReviewMode.SEQUENTIAL,
    status: 'PENDING',
    sourceSha256: 'a'.repeat(64),
    signers: [signer, {
      ...signer,
      id: 'signer-2',
      memberId: 'member-2',
      userId: 'user-2',
      order: 1,
    }],
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const tx = {
      signatureRequest: { findFirst: jest.fn().mockResolvedValue(request), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      signatureSigner: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      reminder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      signatureRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Ada Lovelace', email: 'ada@example.test', emailVerifiedAt: new Date(),
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      ...overrides,
    };
    const workspaces = { authorizeWorkspace: jest.fn().mockResolvedValue({ role: 'STAFF' }) };
    const service = new SignaturesService(
      prisma as never,
      workspaces as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, tx, workspaces };
  }

  it('requires explicit consent before writing a signature', async () => {
    const { service, prisma } = setup();
    await expect(service.sign(workspaceId, requestId, userId, {
      consent: false,
      method: SignatureMethod.TYPED,
      signedName: 'Ada Lovelace',
    }, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks an out-of-order signer in sequential mode', async () => {
    const { service, tx } = setup();
    await expect(service.sign(workspaceId, requestId, 'user-2', {
      consent: true,
      method: SignatureMethod.TYPED,
      signedName: 'Ada Lovelace',
    }, {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.signatureSigner.updateMany).not.toHaveBeenCalled();
  });

  it('requires the signing account email to be verified', async () => {
    const { service, prisma } = setup({
      user: { findUnique: jest.fn().mockResolvedValue({
        name: 'Ada Lovelace', email: 'ada@example.test', emailVerifiedAt: null,
      }) },
    });
    await expect(service.sign(workspaceId, requestId, userId, {
      consent: true,
      method: SignatureMethod.TYPED,
      signedName: 'Ada Lovelace',
    }, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose a preserved document to non-participants', async () => {
    const { service, prisma } = setup();

    await expect(service.getDocument(workspaceId, requestId, 'unrelated-user', false))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.signatureRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: requestId,
        workspaceId,
        OR: expect.arrayContaining([
          { createdById: 'unrelated-user' },
          { signers: { some: { userId: 'unrelated-user' } } },
        ]),
      }),
    }));
  });

  it('records consent and a typed signature for an eligible signer', async () => {
    const { service, prisma, tx } = setup();
    const updatedRequest = {
      ...request,
      signers: [{ ...signer, status: SignatureSignerStatus.SIGNED, method: SignatureMethod.TYPED, signedName: 'Ada Lovelace' }, request.signers[1]],
      finalFile: null,
    };
    prisma.signatureRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(updatedRequest);
    const result = await service.sign(workspaceId, requestId, userId, {
      consent: true,
      method: SignatureMethod.TYPED,
      signedName: 'Ada Lovelace',
    }, { ipAddress: '127.0.0.1' });
    expect(tx.signatureSigner.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: signer.id, requestId, status: SignatureSignerStatus.PENDING },
      data: expect.objectContaining({
        status: SignatureSignerStatus.SIGNED,
        consentText: expect.any(String),
        consentedEmail: 'ada@example.test',
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SIGNATURE_SIGNED', targetType: 'SignatureRequest' }),
    }));
    expect(result.status).toBe('PENDING');
  });
});
