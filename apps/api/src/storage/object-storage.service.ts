import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

@Injectable()
export class ObjectStorageService {
  private client?: S3Client;
  private readonly bucket = process.env.DOCKHIVE_BUCKET;

  assertConfigured(): void {
    if (this.localDirectory()) return;
    this.getClient();
  }

  private localDirectory(): string | null {
    const driver = process.env.OBJECT_STORAGE_DRIVER ?? 's3';
    if (driver === 's3') return null;
    if (driver !== 'local') {
      throw new ServiceUnavailableException('OBJECT_STORAGE_DRIVER must be either "s3" or "local".');
    }
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new ServiceUnavailableException('Local file storage is available only in development or test.');
    }
    return path.resolve(process.env.OBJECT_STORAGE_LOCAL_DIR ?? path.join(process.cwd(), '.local-object-storage'));
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
    if (this.localDirectory()) {
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
    if (this.localDirectory()) {
      const filePath = this.localPath(key);
      const contents = await readFile(filePath);
      return { body: Readable.from(contents), contentType: undefined };
    }
    const result = await this.getClient().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new ServiceUnavailableException('The stored file could not be read.');
    return { body: result.Body as Readable, contentType: result.ContentType };
  }

  async delete(key: string): Promise<void> {
    if (this.localDirectory()) {
      await rm(this.localPath(key), { force: true });
      return;
    }
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unavailable' | 'not-configured'; driver: string }> {
    const driver = process.env.OBJECT_STORAGE_DRIVER ?? 's3';
    try {
      const local = this.localDirectory();
      if (local) {
        await access(local);
        return { status: 'healthy', driver: 'local' };
      }
      await this.getClient().send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { status: 'healthy', driver: 's3-compatible' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return { status: 'not-configured', driver };
      }
      return { status: 'unavailable', driver };
    }
  }
}
