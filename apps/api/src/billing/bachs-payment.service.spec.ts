jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  class MockLogger {
    error() {}
    warn() {}
  }
  return {
    BadRequestException: MockHttpException,
    Injectable: () => (target: unknown) => target,
    Logger: MockLogger,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
    UnauthorizedException: MockHttpException,
  };
});

import { BadRequestException } from '@nestjs/common';
import { PaymentAttemptStatus, Plan } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { BachsPaymentService } from './bachs-payment.service';

describe('BachsPaymentService', () => {
  const originalEnv = {
    BACHS_MODE: process.env.BACHS_MODE,
    BACHS_API_KEY: process.env.BACHS_API_KEY,
    BACHS_WEBHOOK_SECRET: process.env.BACHS_WEBHOOK_SECRET,
    BACHS_FRONTEND_URL: process.env.BACHS_FRONTEND_URL,
  };
  const userFindUnique = jest.fn();
  const subscriptionFindUnique = jest.fn();
  const paymentAttemptCreate = jest.fn();
  const paymentAttemptUpdate = jest.fn();
  const paymentAttemptFindUnique = jest.fn();
  const transaction = jest.fn();
  const getPlan = jest.fn();
  const prisma = {
    user: { findUnique: userFindUnique },
    subscription: { findUnique: subscriptionFindUnique },
    paymentAttempt: {
      create: paymentAttemptCreate,
      update: paymentAttemptUpdate,
      findUnique: paymentAttemptFindUnique,
    },
    $transaction: transaction,
  };
  const service = new BachsPaymentService(
    prisma as unknown as PrismaService,
    { getPlan } as unknown as PlanCatalogueService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACHS_MODE = 'sandbox';
    process.env.BACHS_API_KEY = 'sk_sandbox_test';
    process.env.BACHS_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.BACHS_FRONTEND_URL = 'https://app.example.com';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a NGN checkout using the current persisted plan price', async () => {
    userFindUnique.mockResolvedValue({ email: 'person@example.com', name: 'Person Example' });
    subscriptionFindUnique.mockResolvedValue({ plan: Plan.FREE });
    getPlan.mockResolvedValue({
      currency: 'NGN',
      monthlyPriceMinor: 300_000n,
    });
    paymentAttemptCreate.mockResolvedValue({ id: 'attempt-id' });
    paymentAttemptUpdate.mockResolvedValue({});
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({
        checkout_id: 'chk_checkout123',
        checkout_url: 'https://checkout.bachs.io/c/secure',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(service.createCheckout('user-id', Plan.PRO)).resolves.toEqual({
      checkoutUrl: 'https://checkout.bachs.io/c/secure',
      checkoutId: 'chk_checkout123',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://sandbox-api.bachs.io/v1/checkout-sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'attempt-id' }),
        body: expect.stringContaining('"amount":"3000.00"'),
      }),
    );
    expect(paymentAttemptCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        plan: Plan.PRO,
        amountMinor: 300_000n,
        currency: 'NGN',
      },
    });
  });

  it('activates a month only from a signed, amount-matched success webhook and handles retries once', async () => {
    paymentAttemptFindUnique.mockResolvedValue({
      id: 'attempt-id',
      userId: 'user-id',
      plan: Plan.PRO,
      amountMinor: 300_000n,
      currency: 'NGN',
    });
    const attemptClaim = jest.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const subscriptionUpdate = jest.fn().mockResolvedValue({});
    const workspaceUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const attemptUpdate = jest.fn().mockResolvedValue({});
    const subscriptionInTransaction = jest.fn().mockResolvedValue({
      plan: Plan.FREE,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    const tx = {
      paymentAttempt: { updateMany: attemptClaim, update: attemptUpdate },
      subscription: { findUnique: subscriptionInTransaction, update: subscriptionUpdate },
      workspace: { updateMany: workspaceUpdateMany },
    };
    transaction.mockImplementation((callback: (client: typeof tx) => Promise<void>) => callback(tx));
    getPlan.mockResolvedValue({ storageLimitBytes: 15_000_000_000n });

    const rawBody = Buffer.from(JSON.stringify({
      id: 'evt_test',
      type: 'collection.succeeded',
      data: { checkout_id: 'chk_checkout123', amount: '3000.00', currency: 'NGN' },
    }));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', process.env.BACHS_WEBHOOK_SECRET!)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const header = `t=${timestamp},v1=${signature}`;

    await service.handleWebhook(rawBody, header);
    await service.handleWebhook(rawBody, header);

    expect(attemptClaim).toHaveBeenCalledTimes(2);
    expect(subscriptionUpdate).toHaveBeenCalledTimes(1);
    expect(subscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-id' },
      data: expect.objectContaining({
        plan: Plan.PRO,
        storageLimitBytes: 15_000_000_000n,
        currentPeriodEnd: expect.any(Date),
      }),
    }));
    expect(workspaceUpdateMany).toHaveBeenCalledTimes(1);
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { id: 'attempt-id' },
      data: { periodEnd: expect.any(Date) },
    });
    expect(attemptClaim).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'attempt-id',
        status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.EXPIRED] },
      },
    }));
  });

  it('rejects a signed success event if the amount or currency does not match the saved attempt', async () => {
    paymentAttemptFindUnique.mockResolvedValue({
      id: 'attempt-id',
      userId: 'user-id',
      plan: Plan.PRO,
      amountMinor: 300_000n,
      currency: 'NGN',
    });
    const rawBody = Buffer.from(JSON.stringify({
      type: 'collection.succeeded',
      data: { checkout_id: 'chk_checkout123', amount: '1.00', currency: 'USD' },
    }));
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', process.env.BACHS_WEBHOOK_SECRET!)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');

    await expect(service.handleWebhook(rawBody, `t=${timestamp},v1=${signature}`))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
