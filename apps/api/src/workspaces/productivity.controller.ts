import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  CreateWorkspaceNoteDto, CreateWorkspaceTaskDto, UpdateWorkspaceNoteDto, UpdateWorkspaceTaskDto,
} from './productivity.dto';
import { ProductivityService } from './productivity.service';

@Controller('workspaces/:workspaceId')
@UseGuards(SessionGuard)
export class ProductivityController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get('notes')
  listNotes(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.productivity.listNotes(workspaceId, req.auth.userId);
  }

  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  createNote(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWorkspaceNoteDto,
  ) {
    return this.productivity.createNote(workspaceId, req.auth.userId, dto);
  }

  @Patch('notes/:noteId')
  updateNote(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateWorkspaceNoteDto,
  ) {
    return this.productivity.updateNote(workspaceId, req.auth.userId, noteId, dto);
  }

  @Delete('notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.productivity.deleteNote(workspaceId, req.auth.userId, noteId);
  }

  @Get('tasks')
  listTasks(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.productivity.listTasks(workspaceId, req.auth.userId);
  }

  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  createTask(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWorkspaceTaskDto,
  ) {
    return this.productivity.createTask(workspaceId, req.auth.userId, dto);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateWorkspaceTaskDto,
  ) {
    return this.productivity.updateTask(workspaceId, req.auth.userId, taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTask(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.productivity.deleteTask(workspaceId, req.auth.userId, taskId);
  }
}
