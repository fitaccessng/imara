jest.mock('@nestjs/common', () => {
  const decorator = () => () => undefined;
  class MockHttpException extends Error {}
  class MockLogger {
    error() {}
  }
  return {
    Body: decorator,
    Controller: decorator,
    Delete: decorator,
    Get: decorator,
    HttpCode: decorator,
    Injectable: decorator,
    Optional: decorator,
    Param: decorator,
    ParseUUIDPipe: class {},
    Post: decorator,
    Req: decorator,
    Res: decorator,
    UseGuards: decorator,
    BadRequestException: MockHttpException,
    ConflictException: MockHttpException,
    ForbiddenException: MockHttpException,
    Logger: MockLogger,
    NotFoundException: MockHttpException,
    ServiceUnavailableException: MockHttpException,
    UnauthorizedException: MockHttpException,
    HttpStatus: { OK: 200, CREATED: 201, NO_CONTENT: 204, ACCEPTED: 202 },
  };
});
jest.mock('@nestjs/throttler', () => ({ Throttle: () => () => undefined }));

import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController session cookie', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      SESSION_COOKIE_NAME: 'custom_session',
      SESSION_TTL_DAYS: '30',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets the cookie to the exact expiry persisted for the session', async () => {
    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    const auth = {
      login: jest.fn().mockResolvedValue({
        token: 'opaque-session-token',
        expiresAt,
        user: { id: 'user-id' },
        workspaceId: null,
      }),
    } as unknown as AuthService;
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;
    const controller = new AuthController(auth);

    await controller.login({ email: 'user@example.com', password: 'password' } as never, {
      get: () => 'Browser/1',
    } as never, response);

    expect(cookie).toHaveBeenCalledWith('custom_session', 'opaque-session-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: expiresAt,
    });
    expect(cookie.mock.calls[0][2]).not.toHaveProperty('maxAge');
  });
});
