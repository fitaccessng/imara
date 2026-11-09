import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import {
  CreateDirectConversationDto, CreateWorkspaceChatMessageDto, ListWorkspaceChatMessagesDto,
} from './workspace-chat.dto';
import { WorkspaceChatService } from './workspace-chat.service';

@Controller('workspaces/:workspaceId/chat')
@UseGuards(SessionGuard)
export class WorkspaceChatController {
  constructor(private readonly chat: WorkspaceChatService) {}

  @Get('members')
  members(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.chat.listMembers(workspaceId, req.auth.userId);
  }

  @Get('files')
  files(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.chat.listFiles(workspaceId, req.auth.userId);
  }

  @Get('conversations')
  conversations(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.chat.listConversations(workspaceId, req.auth.userId);
  }

  @Post('direct')
  @HttpCode(HttpStatus.OK)
  createDirectConversation(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.chat.getOrCreateDirectConversation(workspaceId, req.auth.userId, dto.memberId);
  }

  @Get('conversations/:conversationId/messages')
  messages(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListWorkspaceChatMessagesDto,
  ) {
    return this.chat.listMessages(
      workspaceId, conversationId, req.auth.userId, query.afterId, query.beforeId, query.limit,
    );
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateWorkspaceChatMessageDto,
  ) {
    return this.chat.sendMessage(workspaceId, conversationId, req.auth.userId, dto);
  }
}
