import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateReminderDto, UpdateReminderDto } from './reminders.dto';
import { RemindersService } from './reminders.service';

@Controller('workspaces/:workspaceId/reminders')
@UseGuards(SessionGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reminders.list(workspaceId, req.auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateReminderDto,
  ) {
    return this.reminders.create(workspaceId, req.auth.userId, dto);
  }

  @Patch(':reminderId')
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminders.update(workspaceId, reminderId, req.auth.userId, dto);
  }

  @Post(':reminderId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reminders.complete(workspaceId, reminderId, req.auth.userId);
  }

  @Post(':reminderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reminders.cancel(workspaceId, reminderId, req.auth.userId);
  }
}
