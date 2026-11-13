import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  mixin,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { EventStatus, Plan } from '@prisma/client';
import multer, { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Observable, finalize } from 'rxjs';
import { hashToken } from '../auth/token';
import { PrismaService } from '../prisma/prisma.service';
import { PlanCatalogueService } from '../subscriptions/plan-catalogue.service';
import { getPlanFileSizeException, getPlanMaxUploadBytes } from '../subscriptions/plan-entitlements';
import { getMaxUploadBytes } from './storage.service';
import type { Request, Response } from 'express';

function temporaryDirectory(): string {
  return path.resolve(process.env.IMARA_UPLOAD_TMP_DIR ?? path.join(os.tmpdir(), 'imara-uploads'));
}

interface RequestWithUpload extends Request {
  file?: Express.Multer.File;
  auth?: { userId: string };
}

export function TempUploadInterceptor() {
  @Injectable()
  class TemporaryUploadInterceptor implements NestInterceptor {
    readonly logger = new Logger(TemporaryUploadInterceptor.name);
    readonly storage = diskStorage({
      destination: (_request, _file, callback) => {
        const directory = temporaryDirectory();
        void mkdir(directory, { recursive: true, mode: 0o700 })
          .then(() => chmod(directory, 0o700))
          .then(() => callback(null, directory))
          .catch((error: Error) => callback(error, directory));
      },
      filename: (_request, _file, callback) => callback(null, `imara-${randomUUID()}.upload`),
    });

    constructor(
      readonly prisma: PrismaService,
      readonly plans: PlanCatalogueService,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      const request = context.switchToHttp().getRequest<RequestWithUpload>();
      const response = context.switchToHttp().getResponse<Response>();
      const plan = await this.requestPlan(request);
      const fileLimit = plan ? getPlanMaxUploadBytes(plan) : getMaxUploadBytes();
      const parseMultipart = multer({
        storage: this.storage,
        limits: { fileSize: fileLimit, files: 1, fields: 20, parts: 22, fieldSize: 64 * 1024 },
      }).single('file');
      try {
        await new Promise<void>((resolve, reject) => {
          parseMultipart(request, response, (error) => error ? reject(error) : resolve());
        });
      } catch (error) {
        await this.removeTemporaryFile(request);
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          if (plan) throw getPlanFileSizeException(plan);
          throw new PayloadTooLargeException({
            statusCode: 413,
            error: 'Payload Too Large',
            message: `The platform upload ceiling is ${getMaxUploadBytes() / (1024 * 1024)} MiB.`,
            maxFileSizeBytes: getMaxUploadBytes(),
          });
        }
        throw error;
      }

      return next.handle().pipe(finalize(() => {
        void this.removeTemporaryFile(request);
      }));
    }

    async removeTemporaryFile(request: RequestWithUpload): Promise<void> {
      const temporaryPath = request.file?.path;
      if (!temporaryPath) return;
      try {
        await rm(temporaryPath, { force: true });
      } catch {
        this.logger.error('Unable to remove a completed temporary upload file.');
      }
    }

    async requestPlan(request: RequestWithUpload): Promise<Plan | null> {
      let userId = request.auth?.userId;
      const captureToken = request.params?.token;
      if (!userId && typeof captureToken === 'string') {
        const event = await this.prisma.event.findFirst({
          where: {
            captureTokenHash: hashToken(captureToken),
            status: EventStatus.ACTIVE,
          },
          select: { ownerUserId: true },
        });
        userId = event?.ownerUserId;
      }
      if (!userId) return null;
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      return subscription ? this.plans.currentPlan(subscription) : null;
    }
  }

  return mixin(TemporaryUploadInterceptor);
}
