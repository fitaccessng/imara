import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { WorkspaceMemberStatus } from '@prisma/client';
import {
  CreateWorkspaceDto, InviteMemberDto, PermissionPreviewDto, ReplaceMemberPermissionsDto, SetFolderPermissionDto, UpdateMemberDto, UpdateWorkspaceDto,
} from './workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@Controller()
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get('workspaces')
  listWorkspaces(@Req() req: AuthenticatedRequest) {
    return this.workspaces.listWorkspaces(req.auth.userId);
  }

  @Post('workspaces')
  @HttpCode(HttpStatus.CREATED)
  createWorkspace(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.createWorkspace(req.auth.userId, dto);
  }

  @Get('workspaces/:workspaceId')
  getWorkspace(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.getWorkspace(workspaceId, req.auth.userId);
  }

  @Patch('workspaces/:workspaceId')
  updateWorkspace(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.updateWorkspace(workspaceId, req.auth.userId, dto);
  }

  @Get('workspaces/:workspaceId/my-folders')
  myFolders(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.accessibleFolders(workspaceId, req.auth.userId);
  }

  @Get('workspaces/:workspaceId/members')
  members(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.listMembers(workspaceId, req.auth.userId);
  }

  @Get('workspaces/:workspaceId/members/:memberId')
  member(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.getMember(workspaceId, memberId, req.auth.userId);
  }

  @Post('workspaces/:workspaceId/invitations')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspaces.invite(workspaceId, req.auth.userId, dto);
  }

  @Get('workspaces/:workspaceId/invitations')
  invitations(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.listInvitations(workspaceId, req.auth.userId);
  }

  @Get('workspaces/:workspaceId/activity')
  activity(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.activity(workspaceId, req.auth.userId);
  }

  @Post('invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(@Req() req: AuthenticatedRequest, @Param('token') token: string) {
    return this.workspaces.acceptInvitation(req.auth.userId, token);
  }

  @Post('workspaces/:workspaceId/invitations/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  resendInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.workspaces.resendInvitation(workspaceId, invitationId, req.auth.userId);
  }

  @Delete('workspaces/:workspaceId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.workspaces.revokeInvitation(workspaceId, invitationId, req.auth.userId);
  }

  @Patch('workspaces/:workspaceId/members/:memberId')
  updateMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.workspaces.updateMember(workspaceId, memberId, req.auth.userId, dto.role, dto.name);
  }

  @Post('workspaces/:workspaceId/members/:memberId/suspend')
  suspendMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.suspendMember(workspaceId, memberId, req.auth.userId, WorkspaceMemberStatus.SUSPENDED);
  }

  @Post('workspaces/:workspaceId/members/:memberId/restore')
  restoreMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.suspendMember(workspaceId, memberId, req.auth.userId, WorkspaceMemberStatus.ACTIVE);
  }

  @Delete('workspaces/:workspaceId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.removeMember(workspaceId, memberId, req.auth.userId);
  }

  @Get('workspaces/:workspaceId/members/:memberId/permissions')
  getMemberPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.workspaces.getMemberPermissions(workspaceId, memberId, req.auth.userId);
  }

  @Put('workspaces/:workspaceId/members/:memberId/permissions')
  replaceMemberPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ReplaceMemberPermissionsDto,
  ) {
    return this.workspaces.replaceMemberPermissions(workspaceId, memberId, req.auth.userId, dto.permissions);
  }

  @Get('workspaces/:workspaceId/folders/:folderId/permissions')
  folderPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.workspaces.folderPermissions(workspaceId, folderId, req.auth.userId);
  }

  @Put('workspaces/:workspaceId/folders/:folderId/permissions')
  setFolderPermission(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: SetFolderPermissionDto,
  ) {
    return this.workspaces.setFolderPermission(workspaceId, folderId, req.auth.userId, dto);
  }

  @Delete('workspaces/:workspaceId/folders/:folderId/permissions/:permissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFolderPermission(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
  ) {
    return this.workspaces.removeFolderPermission(workspaceId, folderId, permissionId, req.auth.userId);
  }

  @Post('workspaces/:workspaceId/folders/:folderId/permissions/preview')
  @HttpCode(HttpStatus.OK)
  previewPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: PermissionPreviewDto,
  ) {
    return this.workspaces.previewFolderPermission(workspaceId, folderId, req.auth.userId, dto.memberId, dto.permissionKeys, dto.inherit);
  }

  @Get('workspaces/:workspaceId/notifications')
  notifications(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.notifications(workspaceId, req.auth.userId);
  }

  @Post('workspaces/:workspaceId/notifications/:notificationId/read')
  @HttpCode(HttpStatus.OK)
  markNotificationRead(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.workspaces.markNotificationRead(workspaceId, notificationId, req.auth.userId);
  }
}
