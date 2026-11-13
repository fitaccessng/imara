import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { UploadInput } from './storage.service';
import { TempUploadInterceptor } from './temp-upload.interceptor';
import { CreateFileRequestDto, FileRequestUploadDto } from './file-requests.dto';
import { FileRequestsService } from './file-requests.service';

@Controller('file-requests')
export class FileRequestsController {
  constructor(private readonly requests: FileRequestsService) {}

  @Post()
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFileRequestDto) {
    return this.requests.create(req.auth.userId, dto);
  }

  @Get()
  @UseGuards(SessionGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.requests.list(req.auth.userId);
  }

  @Delete(':id')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.requests.revoke(req.auth.userId, id);
  }

  @Get('public/:token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async metadata(@Param('token') token: string, @Res() response: Response) {
    const metadata = await this.requests.getPublicMetadata(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.json(metadata);
  }

  @Post('public/:fileRequestToken/uploads')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(TempUploadInterceptor())
  async upload(
    @Param('fileRequestToken') token: string,
    @UploadedFile() file: UploadInput,
    @Body() dto: FileRequestUploadDto,
    @Res() response: Response,
  ) {
    const uploaded = await this.requests.upload(token, file, dto.relativePath);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status(HttpStatus.CREATED).json(uploaded);
  }
}
