import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';
import { CalendarService } from './calendar.service';

@Controller()
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('calendar/events')
  personalList(@Req() req: AuthenticatedRequest) {
    return this.calendar.listPersonal(req.auth.userId);
  }

  @Post('calendar/events')
  @HttpCode(HttpStatus.CREATED)
  personalCreate(@Req() req: AuthenticatedRequest, @Body() dto: CreateCalendarEventDto) {
    return this.calendar.createPersonal(req.auth.userId, dto);
  }

  @Patch('calendar/events/:eventId')
  personalUpdate(
    @Req() req: AuthenticatedRequest, @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendar.updatePersonal(req.auth.userId, eventId, dto);
  }

  @Delete('calendar/events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  personalDelete(@Req() req: AuthenticatedRequest, @Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.calendar.deletePersonal(req.auth.userId, eventId);
  }

  @Get('workspaces/:workspaceId/calendar/events')
  workspaceList(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.calendar.listWorkspace(workspaceId, req.auth.userId);
  }

  @Post('workspaces/:workspaceId/calendar/events')
  @HttpCode(HttpStatus.CREATED)
  workspaceCreate(
    @Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendar.createWorkspace(workspaceId, req.auth.userId, dto);
  }

  @Patch('workspaces/:workspaceId/calendar/events/:eventId')
  workspaceUpdate(
    @Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string, @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendar.updateWorkspace(workspaceId, req.auth.userId, eventId, dto);
  }

  @Delete('workspaces/:workspaceId/calendar/events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  workspaceDelete(
    @Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.calendar.deleteWorkspace(workspaceId, req.auth.userId, eventId);
  }
}
