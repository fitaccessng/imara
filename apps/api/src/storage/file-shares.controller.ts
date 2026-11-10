import {
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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { FileSharesService } from './file-shares.service';

@Controller()
export class FileSharesController {
  constructor(private readonly shares: FileSharesService) {}

  @Post('files/:fileId/shares')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  createPersonal(
    @Req() req: AuthenticatedRequest,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shares.createPersonal(req.auth.userId, fileId);
  }

  @Get('files/:fileId/shares')
  @UseGuards(SessionGuard)
  listPersonal(
    @Req() req: AuthenticatedRequest,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shares.listPersonal(req.auth.userId, fileId);
  }

  @Delete('files/:fileId/shares/:shareId')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokePersonal(
    @Req() req: AuthenticatedRequest,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
  ) {
    return this.shares.revokePersonal(req.auth.userId, fileId, shareId);
  }

  @Post('workspaces/:workspaceId/files/:fileId/shares')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  createWorkspace(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shares.createWorkspace(workspaceId, req.auth.userId, fileId);
  }

  @Get('workspaces/:workspaceId/files/:fileId/shares')
  @UseGuards(SessionGuard)
  listWorkspace(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.shares.listWorkspace(workspaceId, req.auth.userId, fileId);
  }

  @Delete('workspaces/:workspaceId/files/:fileId/shares/:shareId')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeWorkspace(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
  ) {
    return this.shares.revokeWorkspace(workspaceId, req.auth.userId, fileId, shareId);
  }

  @Get('public-shares/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async metadata(@Param('token') token: string, @Res() response: Response) {
    const metadata = await this.shares.getPublicMetadata(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.json(metadata);
  }

  @Get('public-shares/:token/download')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async download(@Param('token') token: string, @Res() response: Response) {
    const file = await this.shares.downloadPublic(token);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }
}
