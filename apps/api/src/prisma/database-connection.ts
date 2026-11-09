import type { PoolConfig } from 'pg';

export function createDatabaseConnectionConfig(
  connectionString: string,
  ca = process.env.DATABASE_SSL_CA,
): PoolConfig {
  if (!ca?.trim()) return { connectionString };

  const url = new URL(connectionString);
  for (const key of ['ssl', 'sslcert', 'sslkey', 'sslmode', 'sslrootcert', 'uselibpqcompat']) {
    url.searchParams.delete(key);
  }

  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}
