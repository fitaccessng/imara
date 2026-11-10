jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {
    constructor(message: string, private readonly statusCode: number) {
      super(message);
      this.name = 'HttpException';
    }

    getStatus() {
      return this.statusCode;
    }
  }

  class MockLogger {
    error() {}
  }

  return {
    HttpException: MockHttpException,
    Injectable: () => (target: unknown) => target,
    Logger: MockLogger,
  };
});

import { HttpException, Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { ApiErrorLoggingInterceptor } from './api-error-logging.interceptor';

describe('ApiErrorLoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds a request ID and logs server errors without swallowing them', async () => {
    const request = { method: 'POST', path: '/api/v1/files' };
    const response = { setHeader: jest.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => throwError(() => new HttpException('Storage unavailable', 503)),
    } as CallHandler;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(lastValueFrom(new ApiErrorLoggingInterceptor().intercept(context, next)))
      .rejects.toThrow('Storage unavailable');

    const requestId = response.setHeader.mock.calls[0]?.[1];
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(logger).toHaveBeenCalledWith(
      `requestId=${requestId} method=POST path=/api/v1/files status=503 error=HttpException`,
    );
  });

  it('does not log client errors as server failures', async () => {
    const response = { setHeader: jest.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', path: '/api/v1/files' }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => throwError(() => new HttpException('Unauthorized', 401)),
    } as CallHandler;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(lastValueFrom(new ApiErrorLoggingInterceptor().intercept(context, next)))
      .rejects.toThrow('Unauthorized');

    expect(logger).not.toHaveBeenCalled();
  });
});
