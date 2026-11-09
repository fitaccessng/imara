import { createDatabaseConnectionConfig } from './database-connection';

describe('createDatabaseConnectionConfig', () => {
  const connectionString = 'postgresql://user:password@db.example:5432/imara?schema=public&sslmode=require';

  it('preserves the connection string when no private CA is configured', () => {
    expect(createDatabaseConnectionConfig(connectionString, '')).toEqual({ connectionString });
  });

  it('uses the provided CA while retaining strict certificate verification', () => {
    const config = createDatabaseConnectionConfig(connectionString, 'test CA certificate');

    expect(config.connectionString).toBe(
      'postgresql://user:password@db.example:5432/imara?schema=public',
    );
    expect(config.ssl).toEqual({
      ca: 'test CA certificate',
      rejectUnauthorized: true,
    });
  });
});
