import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SupportTicketCreateDto, SupportTicketReplyDto } from '../admin/admin.dto';
import { SupportTicketService } from './support-ticket.service';

@Controller('support/tickets')
@UseGuards(SessionGuard)
export class SupportTicketController {
  constructor(private readonly tickets: SupportTicketService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: SupportTicketCreateDto) {
    return this.tickets.create(request.auth.userId, dto);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.tickets.listForUser(request.auth.userId);
  }

  @Get(':id')
  details(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.tickets.userDetails(id, request.auth.userId);
  }

  @Post(':id/messages')
  addMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: SupportTicketReplyDto,
  ) {
    return this.tickets.addUserMessage(id, request.auth.userId, dto);
  }
}
