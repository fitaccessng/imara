import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const sameSite = process.env.COOKIE_SAME_SITE
    ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
  const secureCookie = process.env.COOKIE_SECURE === 'true';
  if (process.env.NODE_ENV === 'production' && !secureCookie) {
    throw new Error('COOKIE_SECURE=true is required in production');
  }
  if (sameSite === 'none' && !secureCookie) {
    throw new Error('COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none');
  }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.status(403).json({ statusCode: 403, message: 'Origin not allowed' });
      return;
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.setGlobalPrefix('api/v1');
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

bootstrap();
