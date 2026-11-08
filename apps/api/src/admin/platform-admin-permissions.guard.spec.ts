jest.mock('@nestjs/common', () => ({
  ForbiddenException: class ForbiddenException extends Error {},
  Injectable: () => (target: unknown) => target,
}));
jest.mock('@nestjs/core', () => ({ Reflector: class Reflector {} }));

import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PlatformAdminRole } from '@prisma/client';
import { PlatformAdminPermissionsGuard } from './platform-admin-permissions.guard';
import { PlatformAdminPermission } from './platform-admin.permissions';

describe('PlatformAdminPermissionsGuard', () => {
  function makeGuard(permission: PlatformAdminPermission) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(permission),
    };
    const guard = new PlatformAdminPermissionsGuard(reflector as unknown as Reflector);
    return { guard, reflector };
  }

  function makeContext(role?: PlatformAdminRole) {
    const request = {
      platformAdmin: role ? { platformAdminProfile: { role } } : undefined,
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  it('allows the configured role permission', () => {
    const { guard, reflector } = makeGuard(PlatformAdminPermission.USERS_READ);
    const { context } = makeContext(PlatformAdminRole.USER_MANAGEMENT_ADMIN);
    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      'platformAdminPermission',
      expect.any(Array),
    );
  });

  it('denies a role without the route permission and a missing profile', () => {
    const { guard } = makeGuard(PlatformAdminPermission.AUDIT_LOG_READ);
    const { context: wrongRole } = makeContext(PlatformAdminRole.FINANCE_ADMIN);
    const { context: missingProfile } = makeContext();
    expect(() => guard.canActivate(wrongRole)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(missingProfile)).toThrow(ForbiddenException);
  });

  it('allows super admin permission-list bypass', () => {
    const { guard } = makeGuard(PlatformAdminPermission.AUDIT_LOG_READ);
    const { context } = makeContext(PlatformAdminRole.SUPER_ADMIN);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('fails closed when a route has no permission metadata and no explicit exemption', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new PlatformAdminPermissionsGuard(reflector as unknown as Reflector);
    const { context } = makeContext(PlatformAdminRole.SUPER_ADMIN);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
