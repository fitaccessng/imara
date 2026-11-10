import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService local driver', () => {
  const originalEnvironment = { ...process.env };
  let directory: string;
  let storage: ObjectStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'imara-object-store-'));
    process.env.NODE_ENV = 'test';
    process.env.OBJECT_STORAGE_DRIVER = 'local';
    process.env.OBJECT_STORAGE_LOCAL_DIR = directory;
    storage = new ObjectStorageService();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('writes and reads bytes under the configured local directory, then deletes them', async () => {
    const bytes = Buffer.from('local test media');
    storage.assertConfigured();
    await storage.put('user-id/event-id/media.bin', bytes, 'application/octet-stream');
    const object = await storage.get('user-id/event-id/media.bin');
    const chunks: Buffer[] = [];
    for await (const chunk of object.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks)).toEqual(bytes);

    await storage.delete('user-id/event-id/media.bin');
    await expect(storage.get('user-id/event-id/media.bin')).rejects.toThrow();
  });

  it('rejects object keys that escape the storage root', async () => {
    await expect(storage.put('../outside.bin', Buffer.from('x'), 'text/plain'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not allow local storage in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => storage.assertConfigured()).toThrow(ServiceUnavailableException);
  });

  it('reports local storage health', async () => {
    await expect(storage.healthCheck()).resolves.toEqual({
      status: 'healthy',
      driver: 'local',
    });
  });

  it('reports missing production S3 configuration without exposing credentials', async () => {
    process.env.OBJECT_STORAGE_DRIVER = 's3';
    process.env.NODE_ENV = 'production';
    delete process.env.DOCKHIVE_S3_ENDPOINT;
    delete process.env.DOCKHIVE_ACCESS_KEY_ID;
    delete process.env.DOCKHIVE_SECRET_ACCESS_KEY;
    delete process.env.DOCKHIVE_BUCKET;

    await expect(storage.healthCheck()).resolves.toEqual({
      status: 'not-configured',
      driver: 's3',
    });
  });
});
