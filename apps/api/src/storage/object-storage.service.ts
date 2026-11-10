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
    const directory = this.localDirectory();
    if (directory) {
      await this.assertDirectoryAvailable(directory);
      return;
    }
    this.getClient();
  }

  private localDirectory(): string | null {
    const driver = process.env.OBJECT_STORAGE_DRIVER ?? 'hivepod';
    if (driver === 's3') return null;
    if (driver !== 'local' && driver !== 'hivepod') {
      throw new ServiceUnavailableException('OBJECT_STORAGE_DRIVER must be either "s3", "local", or "hivepod".');
    }
    if (driver === 'local' && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new ServiceUnavailableException('Local file storage is available only in development or test.');
    }
    const directory = driver === 'hivepod'
      ? process.env.HIVEPOD_STORAGE_DIR ?? '/data/imara'
      : process.env.OBJECT_STORAGE_LOCAL_DIR ?? path.join(process.cwd(), '.local-object-storage');
    return path.resolve(directory);
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
    const driver = process.env.OBJECT_STORAGE_DRIVER ?? 'hivepod';
    try {
      const local = this.localDirectory();
      if (local) {
        await access(local, constants.R_OK | constants.W_OK);
        const info = await stat(local);
        if (!info.isDirectory()) throw new Error('Configured storage path is not a directory');
        return { status: 'healthy', driver };
      }
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
