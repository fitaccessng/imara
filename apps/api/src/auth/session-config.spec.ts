import { getSessionConfig } from './session-config';

describe('session cookie configuration', () => {
  it('uses the cross-site-safe production defaults and configured session TTL', () => {
    expect(getSessionConfig({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      SESSION_TTL_DAYS: '14',
    } as NodeJS.ProcessEnv)).toEqual({
      cookieName: 'imara_session',
      cookieSecure: true,
      cookieSameSite: 'none',
      ttlDays: 14,
    });
  });

  it('rejects invalid SameSite values instead of silently downgrading to lax', () => {
    expect(() => getSessionConfig({
      COOKIE_SAME_SITE: 'None',
      COOKIE_SECURE: 'true',
    } as NodeJS.ProcessEnv)).toThrow('COOKIE_SAME_SITE must be lax, strict, or none');
  });

  it('requires Secure cookies for production and SameSite=None', () => {
    expect(() => getSessionConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv))
      .toThrow('COOKIE_SECURE=true is required in production');
    expect(() => getSessionConfig({
      COOKIE_SAME_SITE: 'none',
    } as NodeJS.ProcessEnv)).toThrow('COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none');
  });

  it('rejects invalid session lifetimes before cookies or sessions are issued', () => {
    expect(() => getSessionConfig({ SESSION_TTL_DAYS: '0' } as NodeJS.ProcessEnv))
      .toThrow('SESSION_TTL_DAYS must be a positive whole number');
    expect(() => getSessionConfig({ SESSION_TTL_DAYS: '1.5' } as NodeJS.ProcessEnv))
      .toThrow('SESSION_TTL_DAYS must be a positive whole number');
  });
});
