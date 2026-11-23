import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateMeetingDto, UpdateMeetingDto } from './meetings.dto';
import { MeetingsService } from './meetings.service';

@Controller('meetings')
@UseGuards(SessionGuard)
export class PersonalMeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.meetings.listPersonal(req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateMeetingDto) {
    return this.meetings.createPersonal(req.auth.userId, dto);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.meetings.getPersonal(req.auth.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetings.updatePersonal(req.auth.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.meetings.deletePersonal(req.auth.userId, id);
  }

  @Post(':id/action-items/:actionItemId/task')
  @HttpCode(HttpStatus.CREATED)
  createActionTask(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('actionItemId', new ParseUUIDPipe({ version: '4' })) actionItemId: string,
  ) {
    return this.meetings.createActionTask(req.auth.userId, id, actionItemId);
  }
}

@Controller('workspaces/:workspaceId/meetings')
@UseGuards(SessionGuard)
export class WorkspaceMeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    return this.meetings.listWorkspace(workspaceId, req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetings.createWorkspace(workspaceId, req.auth.userId, dto);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetings.getWorkspace(workspaceId, req.auth.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetings.updateWorkspace(workspaceId, req.auth.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.meetings.deleteWorkspace(workspaceId, req.auth.userId, id);
  }

  @Post(':id/action-items/:actionItemId/task')
  @HttpCode(HttpStatus.CREATED)
  createActionTask(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('actionItemId', ParseUUIDPipe) actionItemId: string,
  ) {
    return this.meetings.createWorkspaceActionTask(workspaceId, req.auth.userId, id, actionItemId);
  }
}
