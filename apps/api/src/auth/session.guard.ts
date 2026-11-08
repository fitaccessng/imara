import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Plan, UserAccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { hashToken } from './token';

const SESSION_ACTIVITY_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanCatalogueService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'imara_session'];
    if (typeof token !== 'string' || token.length < 32) throw new UnauthorizedException('Authentication required');

    const tokenHash = hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        revokedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        user: {
          select: {
            accountStatus: true,
            subscription: {
              select: { id: true, plan: true, currentPeriodEnd: true },
            },
          },
        },
      },
    });
    if (
      !session
      || session.revokedAt
      || session.expiresAt <= new Date()
      || session.user.accountStatus !== UserAccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Session is invalid or expired');
    }
    const now = new Date();
    const subscription = session.user.subscription;
    if (
      subscription
      && subscription.plan !== Plan.FREE
      && subscription.currentPeriodEnd
      && subscription.currentPeriodEnd <= now
    ) {
      await this.prisma.$transaction((tx) => (
        this.plans.currentPlan({ ...subscription, userId: session.userId }, tx)
      ));
    }
    if (session.lastSeenAt.getTime() <= now.getTime() - SESSION_ACTIVITY_INTERVAL_MS) {
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
          lastSeenAt: { lte: new Date(now.getTime() - SESSION_ACTIVITY_INTERVAL_MS) },
        },
        data: { lastSeenAt: now },
      });
    }
    req.auth = { userId: session.userId, sessionId: session.id, tokenHash: session.tokenHash };
    return true;
  }
}
