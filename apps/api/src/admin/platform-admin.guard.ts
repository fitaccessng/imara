import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PlatformAdminStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlatformAdminRequest } from './platform-admin.types';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    const userId = request.auth?.userId;
    if (typeof userId !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        platformAdminProfile: { select: { role: true, status: true } },
      },
    });
    const profile = user?.platformAdminProfile;
    if (
      !user
      || user.role !== UserRole.ADMIN
      || !profile
      || profile.status !== PlatformAdminStatus.ACTIVE
    ) {
      throw new ForbiddenException('Platform administrator access required');
    }

    request.platformAdmin = { ...user, platformAdminProfile: profile };
    return true;
  }
}
