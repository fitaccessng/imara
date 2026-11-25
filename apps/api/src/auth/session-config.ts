export type SessionSameSite = 'lax' | 'strict' | 'none';

export interface SessionConfig {
  cookieName: string;
  cookieSecure: boolean;
  cookieSameSite: SessionSameSite;
  ttlDays: number;
}

export function getSessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  // The web app and API are deployed on sibling HTTPS subdomains. They are
  // cross-origin, but same-site, so Lax is sufficient and avoids making the
  // session cookie a third-party cookie when a deployment is misrouted.
  const cookieSameSite = env.COOKIE_SAME_SITE ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none');
  }

  const cookieSecure = env.COOKIE_SECURE === 'true';
  if (env.NODE_ENV === 'production' && !cookieSecure) {
    throw new Error('COOKIE_SECURE=true is required in production');
  }
  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none');
  }

  const ttlDays = Number(env.SESSION_TTL_DAYS ?? 30);
  if (!Number.isSafeInteger(ttlDays) || ttlDays <= 0) {
    throw new Error('SESSION_TTL_DAYS must be a positive whole number');
  }

  return {
    cookieName: env.SESSION_COOKIE_NAME || 'imara_session',
    cookieSecure,
    cookieSameSite: cookieSameSite as SessionSameSite,
    ttlDays,
  };
}
