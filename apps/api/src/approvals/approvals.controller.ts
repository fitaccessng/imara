import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  ApprovalCommentDto,
  ApprovalDecisionDto,
  CreateApprovalRequestDto,
  CreateApprovalTemplateDto,
  UpdateApprovalTemplateDto,
} from './approvals.dto';
import { ApprovalsService } from './approvals.service';

@Controller('workspaces/:workspaceId/approvals')
@UseGuards(SessionGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('templates')
  templates(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.approvals.listTemplates(workspaceId, req.auth.userId);
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  createTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateApprovalTemplateDto,
  ) {
    return this.approvals.createTemplate(workspaceId, req.auth.userId, dto);
  }

  @Patch('templates/:templateId')
  updateTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateApprovalTemplateDto,
  ) {
    return this.approvals.updateTemplate(workspaceId, templateId, req.auth.userId, dto.isActive);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('view') view?: string,
  ) {
    if (view && !['mine', 'pending', 'history'].includes(view)) {
      throw new BadRequestException('Unknown approval request view');
    }
    const selectedView = view === 'pending' || view === 'history' ? view : 'mine';
    return this.approvals.listRequests(workspaceId, req.auth.userId, selectedView);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateApprovalRequestDto,
  ) {
    return this.approvals.createRequest(workspaceId, req.auth.userId, dto);
  }

  @Get(':requestId')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.approvals.getRequest(workspaceId, requestId, req.auth.userId);
  }

  @Post(':requestId/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvals.decide(workspaceId, requestId, req.auth.userId, dto.decision, dto.comment);
  }

  @Post(':requestId/comments')
  @HttpCode(HttpStatus.CREATED)
  comment(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ApprovalCommentDto,
  ) {
    return this.approvals.comment(workspaceId, requestId, req.auth.userId, dto.comment);
  }

  @Post(':requestId/resubmit')
  @HttpCode(HttpStatus.OK)
  resubmit(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ApprovalCommentDto,
  ) {
    return this.approvals.resubmit(workspaceId, requestId, req.auth.userId, dto.comment);
  }

  @Post(':requestId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.approvals.cancel(workspaceId, requestId, req.auth.userId);
  }
}
