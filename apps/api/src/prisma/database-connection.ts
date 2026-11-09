import type { PoolConfig } from 'pg';

export function createDatabaseConnectionConfig(
  connectionString: string,
  ca = process.env.DATABASE_SSL_CA,
): PoolConfig {
  const url = new URL(connectionString);
  if (!ca?.trim()) {
    if (url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('uselibpqcompat', 'true');
    }
    return { connectionString: url.toString() };
  }

  for (const key of ['ssl', 'sslcert', 'sslkey', 'sslmode', 'sslrootcert', 'uselibpqcompat']) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}
