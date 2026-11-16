import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentAttemptStatus, Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';

const WEBHOOK_TOLERANCE_SECONDS = 300;
const CHECKOUT_VERIFICATION_INTERVAL_MS = 10_000;

type PaymentAttemptForFulfillment = {
  id: string;
  userId: string;
  checkoutId: string | null;
  plan: Plan;
  amountMinor: bigint;
  currency: string;
};

export type AdminCheckoutVerification = {
  checkoutId: string;
  userId: string;
  plan: Plan;
  status: 'SUCCEEDED' | 'PENDING' | 'EXPIRED' | 'NOT_PAID';
  activated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatAmount(amountMinor: bigint): string {
  const major = amountMinor / 100n;
  const minor = (amountMinor % 100n).toString().padStart(2, '0');
  return `${major}.${minor}`;
}

function parseAmount(amount: unknown): bigint | null {
  if (typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [major, minor = ''] = amount.split('.');
  return BigInt(major) * 100n + BigInt(minor.padEnd(2, '0'));
}

function addOneUtcMonth(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

@Injectable()
export class BachsPaymentService {
  private readonly logger = new Logger(BachsPaymentService.name);
  private readonly checkoutVerificationTimes = new Map<string, number>();
  private readonly checkoutVerifications = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanCatalogueService,
  ) {}

  private config() {
    const key = process.env.BACHS_API_KEY;
    const mode = process.env.BACHS_MODE ?? 'sandbox';
    if (!key || !['sandbox', 'live'].includes(mode)) {
      throw new ServiceUnavailableException('Bachs checkout is not configured.');
    }
    if ((mode === 'sandbox' && !key.startsWith('sk_sandbox_'))
      || (mode === 'live' && !key.startsWith('sk_live_'))) {
      throw new ServiceUnavailableException('Bachs API key does not match the configured environment.');
    }
    return {
      key,
      apiUrl: mode === 'live' ? 'https://api.bachs.io' : 'https://sandbox-api.bachs.io',
    };
  }

  private frontendUrl(): URL {
    let url: URL;
    try {
      url = new URL(
        process.env.BACHS_FRONTEND_URL?.trim()
        || process.env.FRONTEND_URL
        || '',
      );
    } catch {
      throw new ServiceUnavailableException('Configure a public HTTPS frontend URL for Bachs checkout.');
    }
    const localHostname = url.hostname === 'localhost'
      || url.hostname.endsWith('.localhost')
      || url.hostname === '127.0.0.1'
      || url.hostname === '::1';
    if (url.protocol !== 'https:' || localHostname) {
      throw new ServiceUnavailableException('Bachs checkout requires a public HTTPS frontend URL.');
    }
    return url;
  }

  async createCheckout(userId: string, plan: Exclude<Plan, 'FREE'>) {
    const { key, apiUrl } = this.config();
    const frontend = this.frontendUrl();
    const [user, subscription, catalogue] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      }),
      this.prisma.subscription.findUnique({ where: { userId } }),
      this.plans.getPlan(plan),
    ]);
    if (!user || !subscription) throw new NotFoundException('Account subscription not found');
    if (catalogue.currency !== 'NGN' || catalogue.monthlyPriceMinor <= 0n) {
      throw new ServiceUnavailableException('The selected plan is not configured for NGN checkout.');
    }

    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        userId,
        plan,
        amountMinor: catalogue.monthlyPriceMinor,
        currency: catalogue.currency,
      },
    });
    const successUrl = new URL('/billing/payment-status', frontend);
    const cancelUrl = new URL('/billing/checkout', frontend);
    cancelUrl.searchParams.set('plan', plan);
    cancelUrl.searchParams.set('cancelled', '1');

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/v1/checkout-sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': attempt.id,
        },
        body: JSON.stringify({
          pricing: { currency: catalogue.currency, amount: formatAmount(catalogue.monthlyPriceMinor) },
          customer: { email: user.email, name: user.name },
          success_url: successUrl.toString(),
          cancel_url: cancelUrl.toString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(`Bachs checkout request failed for payment attempt ${attempt.id}: ${
        error instanceof Error ? error.message : String(error)
      }`);
      throw new ServiceUnavailableException('Could not start checkout. Please try again.');
    }

    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      throw new ServiceUnavailableException('Bachs returned an unreadable checkout response.');
    }
    if (!response.ok) {
      this.logger.error(`Bachs checkout request failed with status ${response.status} for attempt ${attempt.id}`);
      throw new ServiceUnavailableException('Could not start checkout. Please try again.');
    }
    if (!isRecord(payload)
      || typeof payload.checkout_id !== 'string'
      || !/^chk_[A-Za-z0-9_-]+$/.test(payload.checkout_id)
      || typeof payload.checkout_url !== 'string') {
      throw new ServiceUnavailableException('Bachs returned an invalid checkout response.');
    }
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(payload.checkout_url);
    } catch {
      throw new ServiceUnavailableException('Bachs returned an invalid checkout URL.');
    }
    if (checkoutUrl.protocol !== 'https:'
      || !(checkoutUrl.hostname === 'bachs.io' || checkoutUrl.hostname.endsWith('.bachs.io'))) {
      throw new ServiceUnavailableException('Bachs returned an untrusted checkout URL.');
    }

    await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { checkoutId: payload.checkout_id },
    });
    return { checkoutUrl: checkoutUrl.toString(), checkoutId: payload.checkout_id };
  }

  async getPayment(userId: string, checkoutId: string) {
    let attempt = await this.prisma.paymentAttempt.findFirst({
      where: { userId, checkoutId },
      select: {
        id: true,
        userId: true,
        checkoutId: true,
        plan: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
        periodEnd: true,
      },
    });
    if (!attempt) throw new NotFoundException('Payment not found');
    if (attempt.status === PaymentAttemptStatus.PENDING) {
      await this.verifyPendingCheckout(attempt);
      attempt = await this.prisma.paymentAttempt.findFirst({
        where: { userId, checkoutId },
        select: {
          id: true,
          userId: true,
          checkoutId: true,
          plan: true,
          amountMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          paidAt: true,
          periodEnd: true,
        },
      });
      if (!attempt) throw new NotFoundException('Payment not found');
    }
    return {
      ...attempt,
      amountMinor: attempt.amountMinor.toString(),
    };
  }

  async verifyCheckoutForAdmin(checkoutId: string): Promise<AdminCheckoutVerification> {
    if (!/^chk_[A-Za-z0-9_-]+$/.test(checkoutId)) {
      throw new BadRequestException('Bachs checkout ID is invalid.');
    }
    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { checkoutId } });
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    if (attempt.plan === Plan.FREE || attempt.amountMinor <= 0n) {
      throw new BadRequestException('Only paid plan checkouts can activate a subscription.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: attempt.userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Payment account not found');

    const verification = await this.fetchAndVerifyCheckout(attempt, user.email);
    return {
      checkoutId,
      userId: attempt.userId,
      plan: attempt.plan,
      status: verification.status,
      activated: verification.activated,
    };
  }

  async listPayments(userId: string) {
    const attempts = await this.prisma.paymentAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        checkoutId: true,
        plan: true,
        amountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
        periodEnd: true,
      },
    });
    return attempts.map((attempt) => ({
      ...attempt,
      amountMinor: attempt.amountMinor.toString(),
    }));
  }

  private verifySignature(rawBody: Buffer, signatureHeader: string | undefined): void {
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Bachs webhook verification is not configured.');
    if (!signatureHeader) throw new UnauthorizedException('Bachs signature is missing.');

    const parts = signatureHeader.split(',').map((part) => part.trim().split('=', 2));
    const timestamp = parts.find(([key]) => key === 't')?.[1];
    const signatures = parts
      .filter(([key, value]) => key === 'v1' && value)
      .map(([, value]) => value);
    if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) {
      throw new UnauthorizedException('Bachs signature is invalid.');
    }
    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds)
      || Math.abs(Date.now() / 1000 - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Bachs signature has expired.');
    }
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest();
    const matches = signatures.some((signature) => {
      if (!/^[\da-f]{64}$/i.test(signature)) return false;
      const received = Buffer.from(signature, 'hex');
      return received.length === expected.length && timingSafeEqual(expected, received);
    });
    if (!matches) throw new UnauthorizedException('Bachs signature is invalid.');
  }

  private async verifyPendingCheckout(attempt: PaymentAttemptForFulfillment): Promise<void> {
    if (!attempt.checkoutId) return;
    const checkoutId = attempt.checkoutId;
    const inFlight = this.checkoutVerifications.get(checkoutId);
    if (inFlight) {
      await inFlight;
      return;
    }
    const lastCheckedAt = this.checkoutVerificationTimes.get(checkoutId) ?? 0;
    if (Date.now() - lastCheckedAt < CHECKOUT_VERIFICATION_INTERVAL_MS) return;

    if (this.checkoutVerificationTimes.size >= 1_000 && !this.checkoutVerificationTimes.has(checkoutId)) {
      const oldestCheckoutId = this.checkoutVerificationTimes.keys().next().value;
      if (oldestCheckoutId) this.checkoutVerificationTimes.delete(oldestCheckoutId);
    }
    this.checkoutVerificationTimes.set(checkoutId, Date.now());
    const verification = this.fetchAndVerifyCheckout(attempt);
    this.checkoutVerifications.set(checkoutId, verification);
    try {
      await verification;
    } finally {
      this.checkoutVerifications.delete(checkoutId);
    }
  }

  private async fetchAndVerifyCheckout(
    attempt: PaymentAttemptForFulfillment,
    expectedUserEmail?: string,
  ): Promise<{ status: AdminCheckoutVerification['status']; activated: boolean }> {
    const checkoutId = attempt.checkoutId;
    if (!checkoutId) throw new BadRequestException('Bachs checkout ID is missing.');
    const { key, apiUrl } = this.config();

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(`Bachs checkout verification failed for attempt ${attempt.id}: ${
        error instanceof Error ? error.message : String(error)
      }`);
      throw new ServiceUnavailableException('Could not verify payment with Bachs. Please try again.');
    }

    if (!response.ok) {
      this.logger.error(`Bachs checkout verification returned status ${response.status} for attempt ${attempt.id}`);
      throw new ServiceUnavailableException('Could not verify payment with Bachs. Please try again.');
    }

    let checkout: unknown;
    try {
      checkout = await response.json() as unknown;
    } catch {
      throw new ServiceUnavailableException('Bachs returned an unreadable checkout response.');
    }
    if (!isRecord(checkout) || checkout.checkout_id !== checkoutId) {
      throw new ServiceUnavailableException('Bachs returned an invalid checkout response.');
    }
    const charge = checkout.charge;
    const paid = checkout.status === 'completed'
      && (checkout.payment_status === 'succeeded' || checkout.payment_status === 'paid')
      && isRecord(charge)
      && (charge.status === 'succeeded' || charge.status === 'SUCCEEDED');
    if (!paid) {
      return {
        status: checkout.status === 'expired'
          ? 'EXPIRED'
          : checkout.payment_status === 'processing' ? 'PENDING' : 'NOT_PAID',
        activated: false,
      };
    }

    if (attempt.plan === Plan.FREE || attempt.amountMinor <= 0n) {
      throw new BadRequestException('Only paid plan checkouts can activate a subscription.');
    }
    if (checkout.currency !== attempt.currency
      || parseAmount(checkout.amount) !== attempt.amountMinor) {
      this.logger.error(`Bachs checkout amount or currency mismatch for attempt ${attempt.id}`);
      throw new BadRequestException('Payment amount or currency does not match the checkout.');
    }
    if (expectedUserEmail !== undefined) {
      const emails = [
        isRecord(checkout.customer) ? checkout.customer.email : undefined,
        isRecord(checkout.customer_details) ? checkout.customer_details.email : undefined,
      ].filter((email): email is string => typeof email === 'string' && email.trim().length > 0);
      if (!emails.length || emails.some((email) => email.trim().toLowerCase() !== expectedUserEmail.trim().toLowerCase())) {
        throw new BadRequestException('Bachs checkout customer does not match the payment account.');
      }
    }
    const activated = await this.fulfillAttempt(attempt);
    return { status: 'SUCCEEDED', activated };
  }

  private async fulfillAttempt(attempt: PaymentAttemptForFulfillment): Promise<boolean> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          status: { in: [PaymentAttemptStatus.PENDING, PaymentAttemptStatus.EXPIRED] },
        },
        data: { status: PaymentAttemptStatus.SUCCEEDED, paidAt: now },
      });
      if (!claimed.count) return false;

      const subscription = await tx.subscription.findUnique({ where: { userId: attempt.userId } });
      if (!subscription) throw new NotFoundException('Account subscription not found');
      const renewing = subscription.plan === attempt.plan
        && subscription.currentPeriodEnd !== null
        && subscription.currentPeriodEnd > now;
      const periodStart = renewing ? subscription.currentPeriodEnd ?? now : now;
      const periodEnd = addOneUtcMonth(periodStart);
      const plan = await this.plans.getPlan(attempt.plan, tx);
      await tx.subscription.update({
        where: { userId: attempt.userId },
        data: {
          plan: attempt.plan,
          storageLimitBytes: plan.storageLimitBytes,
          currentPeriodStart: renewing ? subscription.currentPeriodStart ?? periodStart : now,
          currentPeriodEnd: periodEnd,
        },
      });
      await tx.workspace.updateMany({
        where: { ownerUserId: attempt.userId },
        data: { storageLimitBytes: plan.storageLimitBytes },
      });
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { periodEnd },
      });
      return true;
    });
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!rawBody) throw new BadRequestException('Webhook request body is missing.');
    this.verifySignature(rawBody, signature);

    let event: unknown;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Webhook payload is invalid.');
    }
    if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) {
      throw new BadRequestException('Webhook payload is invalid.');
    }
    if (event.type === 'checkout.expired') {
      const checkoutId = event.data.checkout_id;
      if (typeof checkoutId !== 'string' || !/^chk_[A-Za-z0-9_-]+$/.test(checkoutId)) {
        throw new BadRequestException('Webhook checkout ID is invalid.');
      }
      await this.prisma.paymentAttempt.updateMany({
        where: { checkoutId, status: PaymentAttemptStatus.PENDING },
        data: { status: PaymentAttemptStatus.EXPIRED },
      });
      return;
    }
    const paidCollection = event.type === 'collection.succeeded' && event.data.status === 'SUCCEEDED';
    const paidCheckout = event.type === 'checkout.completed'
      && event.data.status === 'completed'
      && (event.data.payment_status === 'succeeded' || event.data.payment_status === 'paid');
    if (!paidCollection && !paidCheckout) return;

    const checkoutId = event.data.checkout_id;
    if (typeof checkoutId !== 'string' || !/^chk_[A-Za-z0-9_-]+$/.test(checkoutId)) {
      throw new BadRequestException('Webhook checkout ID is invalid.');
    }

    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { checkoutId } });
    if (!attempt) {
      this.logger.warn(`Ignoring Bachs payment for unknown checkout ${checkoutId}`);
      return;
    }
    if (attempt.plan === Plan.FREE || attempt.amountMinor <= 0n) {
      throw new BadRequestException('Only paid plan checkouts can activate a subscription.');
    }
    if (event.data.currency !== attempt.currency
      || parseAmount(event.data.amount) !== attempt.amountMinor) {
      throw new BadRequestException('Payment amount or currency does not match the checkout.');
    }

    await this.fulfillAttempt(attempt);
  }
}
