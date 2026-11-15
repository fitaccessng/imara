import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CreatePersonalDocumentDto,
  SignPersonalAgreementDto,
  SubmitPersonalFormDto,
  UpdatePersonalDocumentDto,
} from './documents.dto';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.documents.list(req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePersonalDocumentDto) {
    return this.documents.create(req.auth.userId, dto);
  }

  @Get(':id/responses')
  responses(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.documents.responses(req.auth.userId, id);
  }

  @Post(':id/share')
  @HttpCode(HttpStatus.CREATED)
  share(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.documents.share(req.auth.userId, id);
  }

  @Delete(':id/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeShare(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.documents.revokeShare(req.auth.userId, id);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.documents.get(req.auth.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePersonalDocumentDto,
  ) {
    return this.documents.update(req.auth.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.documents.delete(req.auth.userId, id);
  }
}

@Controller('public-documents')
export class PublicDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async get(@Param('token') token: string, @Res() response: Response) {
    const document = await this.documents.getPublic(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.json(document);
  }

  @Post(':token/responses')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  submitForm(
    @Param('token') token: string,
    @Body() dto: SubmitPersonalFormDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.documents.submitForm(token, dto).then((result) => {
      response.setHeader('Cache-Control', 'no-store');
      return result;
    });
  }

  @Post(':token/sign')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  sign(
    @Param('token') token: string,
    @Body() dto: SignPersonalAgreementDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.documents.signAgreement(token, dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    }).then((result) => {
      response.setHeader('Cache-Control', 'no-store');
      return result;
    });
  }
}
