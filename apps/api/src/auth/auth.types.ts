import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  auth: { userId: string; sessionId: string; tokenHash: string };
}

export const FREE_STORAGE_LIMIT_BYTES = 5_368_709_120n;
