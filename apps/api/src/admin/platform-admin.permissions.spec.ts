jest.mock('@nestjs/common', () => ({
  SetMetadata: () => () => undefined,
}));

import { PlatformAdminRole } from '@prisma/client';
import {
  PLATFORM_ADMIN_PERMISSIONS,
  PlatformAdminPermission,
  roleHasPlatformAdminPermission,
} from './platform-admin.permissions';

describe('platform-admin permissions', () => {
  it.each([
    [PlatformAdminRole.USER_MANAGEMENT_ADMIN, PlatformAdminPermission.USERS_READ, true],
    [PlatformAdminRole.USER_MANAGEMENT_ADMIN, PlatformAdminPermission.BUSINESSES_READ, false],
    [PlatformAdminRole.USER_MANAGEMENT_ADMIN, PlatformAdminPermission.USER_STATUS_UPDATE, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.USERS_READ, false],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.USER_SESSION_REVOKE, false],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.ANALYTICS_READ, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.PLAN_CATALOGUE_READ, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.PLAN_CATALOGUE_UPDATE, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.SUBSCRIPTIONS_READ, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.PAYMENTS_READ, true],
    [PlatformAdminRole.FINANCE_ADMIN, PlatformAdminPermission.PLATFORM_ADMINS_READ, false],
    [PlatformAdminRole.USER_MANAGEMENT_ADMIN, PlatformAdminPermission.PLATFORM_ADMINS_UPDATE, false],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.USERS_READ, true],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.USER_STATUS_UPDATE, false],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.USER_SESSION_REVOKE, true],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.EVENTS_READ, true],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.SUPPORT_TICKETS_READ, true],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.SUPPORT_TICKETS_UPDATE, true],
    [PlatformAdminRole.SUPPORT_ADMIN, PlatformAdminPermission.AUDIT_LOG_READ, false],
    [PlatformAdminRole.MARKETING_ADMIN, PlatformAdminPermission.BUSINESSES_READ, false],
    [PlatformAdminRole.MARKETING_ADMIN, PlatformAdminPermission.ANNOUNCEMENTS_READ, true],
    [PlatformAdminRole.MARKETING_ADMIN, PlatformAdminPermission.ANNOUNCEMENTS_SEND, true],
    [PlatformAdminRole.OPERATIONS_ADMIN, PlatformAdminPermission.BUSINESSES_READ, true],
    [PlatformAdminRole.OPERATIONS_ADMIN, PlatformAdminPermission.STORAGE_INVENTORY_READ, true],
    [PlatformAdminRole.OPERATIONS_ADMIN, PlatformAdminPermission.UPLOAD_MONITORING_READ, true],
    [PlatformAdminRole.OPERATIONS_ADMIN, PlatformAdminPermission.EVENTS_READ, true],
    [PlatformAdminRole.OPERATIONS_ADMIN, PlatformAdminPermission.ANALYTICS_READ, false],
    [PlatformAdminRole.SECURITY_ADMIN, PlatformAdminPermission.STORAGE_INVENTORY_READ, true],
    [PlatformAdminRole.SECURITY_ADMIN, PlatformAdminPermission.UPLOAD_MONITORING_READ, true],
    [PlatformAdminRole.SECURITY_ADMIN, PlatformAdminPermission.AUDIT_LOG_READ, true],
  ])('maps %s -> %s as %s', (role, permission, expected) => {
    expect(roleHasPlatformAdminPermission(role, permission)).toBe(expected);
  });

  it('grants all catalog permissions to super admins only', () => {
    expect(PLATFORM_ADMIN_PERMISSIONS[PlatformAdminRole.SUPER_ADMIN]).toEqual(
      Object.values(PlatformAdminPermission),
    );
    for (const permission of Object.values(PlatformAdminPermission)) {
      expect(roleHasPlatformAdminPermission(PlatformAdminRole.SUPER_ADMIN, permission)).toBe(true);
    }
  });
});
