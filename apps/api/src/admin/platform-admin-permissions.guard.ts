import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAdminPermission } from './platform-admin.permissions';
import type { PlatformAdminRequest } from './platform-admin.types';
import {
  PLATFORM_ADMIN_PERMISSION_EXEMPT_METADATA,
  PLATFORM_ADMIN_PERMISSION_METADATA,
  roleHasPlatformAdminPermission,
} from './platform-admin.permissions';

@Injectable()
export class PlatformAdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<PlatformAdminPermission>(
      PLATFORM_ADMIN_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      const explicitlyExempt = this.reflector.getAllAndOverride<boolean>(
        PLATFORM_ADMIN_PERMISSION_EXEMPT_METADATA,
        [context.getHandler(), context.getClass()],
      );
      if (explicitlyExempt) return true;
      throw new ForbiddenException('Platform-admin permission required');
    }

    const request = context.switchToHttp().getRequest<PlatformAdminRequest>();
    const role = request.platformAdmin?.platformAdminProfile?.role;
    if (!role || !roleHasPlatformAdminPermission(role, permission)) {
      throw new ForbiddenException('Platform-admin permission required');
    }
    return true;
  }
}
