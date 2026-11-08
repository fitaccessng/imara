import type { AuthenticatedRequest } from './auth.types';

describe('authenticated request type', () => {
  it('carries the authenticated user and server-side session identifiers', () => {
    const request: Pick<AuthenticatedRequest, 'auth'> = {
      auth: {
        userId: 'user-id',
        sessionId: 'session-id',
        tokenHash: 'opaque-hash',
      },
    };

    expect(request.auth).toEqual({
      userId: 'user-id',
      sessionId: 'session-id',
      tokenHash: 'opaque-hash',
    });
  });
});
