import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './token';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'imara_session'];
    if (typeof token !== 'string' || token.length < 32) throw new UnauthorizedException('Authentication required');

    const tokenHash = hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, tokenHash: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is invalid or expired');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    req.auth = { userId: session.userId, sessionId: session.id, tokenHash: session.tokenHash };
    return true;
  }
}
