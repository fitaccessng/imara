import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  ServiceUnavailableException: class ServiceUnavailableException extends Error {},
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService drivers', () => {
  const originalEnvironment = { ...process.env };
  let directory: string;
  let storage: ObjectStorageService;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'imara-object-store-'));
    process.env.NODE_ENV = 'test';
    process.env.OBJECT_STORAGE_DRIVER = 'local';
    process.env.OBJECT_STORAGE_LOCAL_DIR = directory;
    delete process.env.HIVEPOD_STORAGE_URL;
    delete process.env.HIVEPOD_STORAGE_TOKEN;
    storage = new ObjectStorageService();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('writes and reads bytes under the configured local directory, then deletes them', async () => {
    const bytes = Buffer.from('local test media');
    await storage.assertConfigured();
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

  it('does not allow local storage in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(storage.assertConfigured()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reports local storage health', async () => {
    await expect(storage.healthCheck()).resolves.toEqual({
      status: 'healthy',
      driver: 'local',
    });
  });

  it('reports HivePod storage as not configured without a URL and service token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OBJECT_STORAGE_DRIVER = 'hivepod';
    delete process.env.HIVEPOD_STORAGE_URL;
    delete process.env.HIVEPOD_STORAGE_TOKEN;

    await expect(storage.assertConfigured()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(storage.healthCheck()).resolves.toEqual({
      status: 'not-configured',
      driver: 'hivepod',
    });
  });

  it('stores, reads, and deletes files through the authenticated HivePod service', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const token = 'a'.repeat(64);
    process.env.NODE_ENV = 'production';
    process.env.OBJECT_STORAGE_DRIVER = 'hivepod';
    process.env.HIVEPOD_STORAGE_URL = 'https://storage.example.test';
    process.env.HIVEPOD_STORAGE_TOKEN = token;
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(Buffer.from('remote file'), {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await storage.assertConfigured();
    await storage.put('user-id/workspaces/workspace-id/file-id', Buffer.from('upload'), 'text/plain');
    const result = await storage.get('user-id/workspaces/workspace-id/file-id');
    const chunks: Buffer[] = [];
    for await (const chunk of result.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    await storage.delete('user-id/workspaces/workspace-id/file-id');

    expect(Buffer.concat(chunks).toString()).toBe('remote file');
    expect(result.contentType).toBe('application/octet-stream');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.test/objects/user-id/workspaces/workspace-id/file-id',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://storage.example.test/objects/user-id/workspaces/workspace-id/file-id',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('requires an HTTPS HivePod URL and a 32-byte hex service token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OBJECT_STORAGE_DRIVER = 'hivepod';
    process.env.HIVEPOD_STORAGE_URL = 'http://storage.example.test';
    process.env.HIVEPOD_STORAGE_TOKEN = 'short';

    await expect(storage.assertConfigured()).rejects.toThrow('valid HTTPS base URL');
    await expect(storage.healthCheck()).resolves.toEqual({
      status: 'not-configured',
      driver: 'hivepod',
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
