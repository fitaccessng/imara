import type { Request } from 'express';
import type {
  PlatformAdminRole,
  PlatformAdminStatus,
  UserRole,
} from '@prisma/client';

export interface PlatformAdminRequest extends Request {
  auth?: { userId: string; sessionId?: string; tokenHash?: string };
  platformAdmin: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    emailVerifiedAt: Date | null;
    platformAdminProfile: {
      role: PlatformAdminRole;
      status: PlatformAdminStatus;
    };
  };
}
