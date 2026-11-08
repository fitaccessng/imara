import { Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { PlatformAnnouncementsService } from './platform-announcements.service';

@Controller('announcements')
@UseGuards(SessionGuard)
export class PlatformAnnouncementsController {
  constructor(private readonly announcements: PlatformAnnouncementsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.announcements.listForUser(request.auth.userId);
  }

  @Post(':id/read')
  markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.announcements.markRead(id, request.auth.userId);
  }
}
