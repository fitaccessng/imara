import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

@Injectable()
export class ObjectStorageService {
  private client?: S3Client;
  private readonly bucket = process.env.DOCKHIVE_BUCKET;

  async assertConfigured(): Promise<void> {
    const driver = this.driver();
    if (driver === 'hivepod') {
      const response = await this.requestHivePod('/health');
      if (!response.ok) throw new ServiceUnavailableException('The HivePod file-storage service is not available.');
      return;
    }
    if (driver === 'local') {
      const directory = this.localDirectory();
      if (!directory) throw new ServiceUnavailableException('Local file storage is not configured.');
      await this.assertDirectoryAvailable(directory);
      return;
    }
    if (driver !== 's3') {
      throw new ServiceUnavailableException('OBJECT_STORAGE_DRIVER must be either "s3", "local", or "hivepod".');
    }
    this.getClient();
  }

  private driver(): string {
    return process.env.OBJECT_STORAGE_DRIVER ?? 'hivepod';
  }

  private localDirectory(): string | null {
    const driver = this.driver();
    if (driver !== 'local') return null;
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new ServiceUnavailableException('Local file storage is available only in development or test.');
    }
    const directory = process.env.OBJECT_STORAGE_LOCAL_DIR ?? path.join(process.cwd(), '.local-object-storage');
    return path.resolve(directory);
  }

  private hivePodConfiguration(): { baseUrl: string; token: string } {
    const endpoint = process.env.HIVEPOD_STORAGE_URL;
    const token = process.env.HIVEPOD_STORAGE_TOKEN;
    if (!endpoint || !token) {
      throw new ServiceUnavailableException(
        'HivePod storage is not configured. Set HIVEPOD_STORAGE_URL and HIVEPOD_STORAGE_TOKEN.',
      );
    }
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new ServiceUnavailableException('The configured HivePod storage URL is invalid.');
    }
    if (!['https:', 'http:'].includes(url.protocol)
      || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new ServiceUnavailableException('HivePod storage must use a valid HTTPS base URL in production.');
    }
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      throw new ServiceUnavailableException('HivePod storage authentication is not configured securely.');
    }
    return { baseUrl: url.origin, token };
  }

  private objectPath(key: string): string {
    const segments = key.split('/');
    if (!key || key.length > 512 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new ServiceUnavailableException('The stored file key is invalid.');
    }
    return `/objects/${segments.map(encodeURIComponent).join('/')}`;
  }

  private async requestHivePod(pathname: string, init: RequestInit = {}): Promise<Response> {
    const { baseUrl, token } = this.hivePodConfiguration();
    try {
      return await fetch(`${baseUrl}${pathname}`, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ServiceUnavailableException('HivePod file storage is temporarily unavailable.');
    }
  }

  private async assertDirectoryAvailable(directory: string): Promise<void> {
    try {
      await access(directory, constants.R_OK | constants.W_OK);
      const info = await stat(directory);
      if (!info.isDirectory()) throw new Error('Configured storage path is not a directory');
    } catch {
      throw new ServiceUnavailableException('The configured file-storage directory is not available.');
    }
  }

  private localPath(key: string): string {
    const root = this.localDirectory();
    if (!root || !key || path.isAbsolute(key)) {
      throw new ServiceUnavailableException('The local storage object key is invalid.');
    }
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new ServiceUnavailableException('The local storage object key is invalid.');
    }
    return resolved;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (this.driver() !== 's3') {
      throw new ServiceUnavailableException('OBJECT_STORAGE_DRIVER must be either "s3", "local", or "hivepod".');
    }
    const endpoint = process.env.DOCKHIVE_S3_ENDPOINT;
    const accessKeyId = process.env.DOCKHIVE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.DOCKHIVE_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      throw new ServiceUnavailableException(
        'File storage is not configured. Configure the DockHive S3-compatible endpoint, bucket, and credentials.',
      );
    }
    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      throw new ServiceUnavailableException('The configured object-storage endpoint is invalid.');
    }
    if (!['https:', 'http:'].includes(parsedEndpoint.protocol)
      || (process.env.NODE_ENV === 'production' && parsedEndpoint.protocol !== 'https:')) {
      throw new ServiceUnavailableException('Object storage must use a valid HTTPS endpoint in production.');
    }
    this.client = new S3Client({
      endpoint: parsedEndpoint.toString().replace(/\/$/, ''),
      region: process.env.DOCKHIVE_S3_REGION || 'auto',
      forcePathStyle: process.env.DOCKHIVE_S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.driver() === 'hivepod') {
      const response = await this.requestHivePod(this.objectPath(key), {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(body.length),
        },
        body: new Uint8Array(body),
      });
      if (!response.ok) throw new ServiceUnavailableException('HivePod file storage could not save the file.');
      return;
    }
    const directory = this.localDirectory();
    if (directory) {
      await this.assertDirectoryAvailable(directory);
      const filePath = this.localPath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      return;
    }
    await this.getClient().send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<{ body: Readable; contentType?: string }> {
    if (this.driver() === 'hivepod') {
      const response = await this.requestHivePod(this.objectPath(key));
      if (!response.ok || !response.body) {
        throw new ServiceUnavailableException('HivePod file storage could not read the file.');
      }
      const source = response.body;
      return {
        body: Readable.from((async function* () {
          const reader = source.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) return;
              yield Buffer.from(value);
            }
          } finally {
            reader.releaseLock();
          }
        })()),
        contentType: response.headers.get('content-type') ?? undefined,
      };
    }
    const directory = this.localDirectory();
    if (directory) {
      await this.assertDirectoryAvailable(directory);
      const filePath = this.localPath(key);
      const contents = await readFile(filePath);
      return { body: Readable.from(contents), contentType: undefined };
    }
    const result = await this.getClient().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new ServiceUnavailableException('The stored file could not be read.');
    return { body: result.Body as Readable, contentType: result.ContentType };
  }

  async delete(key: string): Promise<void> {
    if (this.driver() === 'hivepod') {
      const response = await this.requestHivePod(this.objectPath(key), { method: 'DELETE' });
      if (!response.ok) throw new ServiceUnavailableException('HivePod file storage could not delete the file.');
      return;
    }
    const directory = this.localDirectory();
    if (directory) {
      await this.assertDirectoryAvailable(directory);
      await rm(this.localPath(key), { force: true });
      return;
    }
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unavailable' | 'not-configured';
    driver: string;
    errorCode?: string;
  }> {
    const driver = this.driver();
    if (!['hivepod', 'local', 's3'].includes(driver)) {
      return { status: 'not-configured', driver };
    }
    if (driver === 'hivepod') {
      try {
        const response = await this.requestHivePod('/health');
        if (!response.ok) return { status: 'unavailable', driver, errorCode: `HTTP_${response.status}` };
        const health = await response.json() as { status?: unknown };
        return health.status === 'healthy'
          ? { status: 'healthy', driver }
          : { status: 'unavailable', driver, errorCode: 'HIVEPOD_STORAGE_UNAVAILABLE' };
      } catch (error) {
        const notConfigured = error instanceof ServiceUnavailableException
          && (error.message.includes('not configured') || error.message.includes('not configured securely')
            || error.message.includes('URL is invalid') || error.message.includes('must use'));
        if (notConfigured) return { status: 'not-configured', driver };
        return { status: 'unavailable', driver, errorCode: 'HIVEPOD_STORAGE_UNAVAILABLE' };
      }
    }
    try {
      const local = this.localDirectory();
      if (local) {
        await access(local, constants.R_OK | constants.W_OK);
        const info = await stat(local);
        if (!info.isDirectory()) throw new Error('Configured storage path is not a directory');
        return { status: 'healthy', driver };
      }
      if (driver !== 's3') throw new ServiceUnavailableException('OBJECT_STORAGE_DRIVER must be either "s3", "local", or "hivepod".');
      await this.getClient().send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { status: 'healthy', driver: 's3-compatible' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return { status: 'not-configured', driver };
      }
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string' && /^[A-Za-z0-9._-]{1,60}$/.test(error.code)
        ? error.code
        : typeof error === 'object' && error !== null && 'name' in error
          && typeof error.name === 'string' && /^[A-Za-z0-9._-]{1,60}$/.test(error.name)
          ? error.name
          : 'OBJECT_STORAGE_UNAVAILABLE';
      return { status: 'unavailable', driver, errorCode };
    }
  }
}
