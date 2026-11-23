import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { UploadInput } from '../storage/storage.service';
import { TempUploadInterceptor } from '../storage/temp-upload.interceptor';
import {
  CreateWorkspaceFormDto, SubmitWorkspaceFormDto, UpdateWorkspaceFormDto,
} from './workspace-forms.dto';
import { WorkspaceFormsService } from './workspace-forms.service';

@Controller('workspaces/:workspaceId/forms')
@UseGuards(SessionGuard)
export class WorkspaceFormsController {
  constructor(private readonly forms: WorkspaceFormsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.forms.list(workspaceId, req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWorkspaceFormDto,
  ) {
    return this.forms.create(workspaceId, req.auth.userId, dto);
  }

  @Get(':formId')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.forms.get(workspaceId, req.auth.userId, formId);
  }

  @Patch(':formId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: UpdateWorkspaceFormDto,
  ) {
    return this.forms.update(workspaceId, req.auth.userId, formId, dto);
  }

  @Delete(':formId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.forms.delete(workspaceId, req.auth.userId, formId);
  }

  @Post(':formId/share')
  @HttpCode(HttpStatus.CREATED)
  share(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.forms.share(workspaceId, req.auth.userId, formId);
  }

  @Delete(':formId/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.forms.revoke(workspaceId, req.auth.userId, formId);
  }

  @Get(':formId/responses')
  responses(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.forms.responses(workspaceId, req.auth.userId, formId);
  }
}

@Controller('public-forms')
export class PublicWorkspaceFormsController {
  constructor(private readonly forms: WorkspaceFormsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async get(@Param('token') token: string, @Res() response: Response) {
    const form = await this.forms.getPublic(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.json(form);
  }

  @Post(':token/responses')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('token') token: string,
    @Body() dto: SubmitWorkspaceFormDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forms.submit(token, dto).then((receipt) => {
      response.setHeader('Cache-Control', 'no-store');
      return receipt;
    });
  }

  @Post(':token/questions/:questionId/uploads')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(TempUploadInterceptor())
  async upload(
    @Param('token') token: string,
    @Param('questionId') questionId: string,
    @UploadedFile() file: UploadInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.forms.uploadPublicFile(token, questionId, file);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }
}
