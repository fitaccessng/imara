import { randomUUID } from 'node:crypto';
import { HttpException, Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, throwError, type Observable } from 'rxjs';

@Injectable()
export class ApiErrorLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiErrorLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(catchError((error: unknown) => {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      if (status >= 500) {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        this.logger.error(
          `requestId=${requestId} method=${request.method} path=${request.path} status=${status} error=${errorName}`,
        );
      }
      return throwError(() => error);
    }));
  }
}
