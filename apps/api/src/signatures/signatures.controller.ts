import {
  Body,
  Controller,
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
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateSignatureRequestDto, DeclineSignatureRequestDto, SignSignatureRequestDto } from './signatures.dto';
import { SignaturesService } from './signatures.service';

@Controller('workspaces/:workspaceId/signatures')
@UseGuards(SessionGuard)
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get('sources')
  sources(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.signatures.listSources(workspaceId, req.auth.userId);
  }

  @Get('members')
  members(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.signatures.listMembers(workspaceId, req.auth.userId);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.signatures.list(workspaceId, req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateSignatureRequestDto,
  ) {
    return this.signatures.create(workspaceId, req.auth.userId, dto, this.auditContext(req));
  }

  @Get(':requestId')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.signatures.get(workspaceId, requestId, req.auth.userId);
  }

  @Get(':requestId/document')
  async document(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Res() response: Response,
  ) {
    const file = await this.signatures.getDocument(workspaceId, requestId, req.auth.userId, false);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }

  @Get(':requestId/final')
  async finalDocument(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Res() response: Response,
  ) {
    const file = await this.signatures.getDocument(workspaceId, requestId, req.auth.userId, true);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }

  @Post(':requestId/sign')
  @HttpCode(HttpStatus.OK)
  sign(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: SignSignatureRequestDto,
  ) {
    return this.signatures.sign(workspaceId, requestId, req.auth.userId, dto, this.auditContext(req));
  }

  @Post(':requestId/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: DeclineSignatureRequestDto,
  ) {
    return this.signatures.decline(workspaceId, requestId, req.auth.userId, dto.declineReason, this.auditContext(req));
  }

  @Post(':requestId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.signatures.cancel(workspaceId, requestId, req.auth.userId, this.auditContext(req));
  }

  private auditContext(req: AuthenticatedRequest) {
    return {
      ipAddress: req.ip?.slice(0, 64),
      userAgent: req.get('user-agent')?.slice(0, 512),
    };
  }
}
