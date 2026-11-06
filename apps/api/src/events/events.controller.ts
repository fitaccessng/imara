import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { getMaxUploadBytes, type UploadInput } from '../storage/storage.service';
import { CreateEventDto, UnlockGalleryDto, UpdateEventDto } from './events.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @UseGuards(SessionGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateEventDto) {
    return this.events.create(req.auth.userId, dto);
  }

  @Get()
  @UseGuards(SessionGuard)
  list(@Req() req: AuthenticatedRequest) {
    return this.events.list(req.auth.userId);
  }

  @Get('capture/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  captureInfo(@Param('token') token: string) {
    return this.events.captureInfo(token);
  }

  @Post('capture/:token/uploads')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  captureUpload(@Param('token') token: string, @UploadedFile() file: UploadInput) {
    return this.events.captureUpload(token, file);
  }

  @Get('gallery/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  gallery(@Param('token') token: string, @Headers('authorization') authorization?: string) {
    return this.events.gallery(token, authorization);
  }

  @Post('gallery/:token/unlock')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  unlockGallery(@Param('token') token: string, @Body() dto: UnlockGalleryDto) {
    return this.events.unlockGallery(token, dto.passcode);
  }

  @Get('gallery/:token/media/:mediaId/download')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async galleryMediaDownload(
    @Param('token') token: string,
    @Param('mediaId', new ParseUUIDPipe({ version: '4' })) mediaId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.events.galleryDownload(token, mediaId, authorization);
    this.stream(response, file);
  }

  @Get(':id/media')
  @UseGuards(SessionGuard)
  ownerMedia(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.events.ownerMedia(req.auth.userId, id);
  }

  @Get(':id/media/:mediaId/download')
  @UseGuards(SessionGuard)
  async ownerMediaDownload(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('mediaId', new ParseUUIDPipe({ version: '4' })) mediaId: string,
    @Res() response: Response,
  ) {
    const file = await this.events.ownerMediaDownload(req.auth.userId, id, mediaId);
    this.stream(response, file);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  get(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.events.get(req.auth.userId, id);
  }

  @Patch(':id')
  @UseGuards(SessionGuard)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(req.auth.userId, id, dto);
  }

  @Post(':id/rotate-tokens')
  @UseGuards(SessionGuard)
  rotateTokens(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.events.rotateTokens(req.auth.userId, id);
  }

  @Delete(':id')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.events.delete(req.auth.userId, id);
  }

  private stream(response: Response, file: { body: NodeJS.ReadableStream; name: string; contentType: string }) {
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `inline; filename="media"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }
}
