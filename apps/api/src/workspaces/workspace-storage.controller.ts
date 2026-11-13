import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post,
  Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { RenameFolderDto, ReplaceFileContentDto, UploadFileDto } from '../storage/storage.dto';
import { UploadInput } from '../storage/storage.service';
import { TempUploadInterceptor } from '../storage/temp-upload.interceptor';
import { CreateWorkspaceFolderDto, MoveWorkspaceFileDto, RenameWorkspaceFileDto } from './workspace-storage.dto';
import { WorkspaceStorageService } from './workspace-storage.service';
import { FileDeliveryService } from './file-delivery.service';
import { SendWorkspaceFileDto } from './file-delivery.dto';

@Controller('workspaces/:workspaceId')
@UseGuards(SessionGuard)
export class WorkspaceStorageController {
  constructor(private readonly storage: WorkspaceStorageService, private readonly deliveries: FileDeliveryService) {}

  @Get('storage')
  list(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('folderId', new ParseUUIDPipe({ version: '4', optional: true })) folderId?: string,
  ) {
    return this.storage.list(workspaceId, req.auth.userId, folderId);
  }

  @Get('folders')
  listFolders(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('parentFolderId', new ParseUUIDPipe({ version: '4', optional: true })) parentFolderId?: string,
  ) {
    return this.storage.list(workspaceId, req.auth.userId, parentFolderId).then(({ folders }) => folders);
  }

  @Get('folders/:folderId')
  getFolder(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.storage.getFolder(workspaceId, req.auth.userId, folderId);
  }

  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  createFolder(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateWorkspaceFolderDto,
  ) {
    return this.storage.createFolder(workspaceId, req.auth.userId, dto.name, dto.parentFolderId, dto.memberIds);
  }

  @Patch('folders/:folderId')
  renameFolder(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.storage.renameFolder(workspaceId, req.auth.userId, folderId, dto.name);
  }

  @Delete('folders/:folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFolder(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ) {
    return this.storage.deleteFolder(workspaceId, req.auth.userId, folderId);
  }

  @Post('files')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(TempUploadInterceptor())
  upload(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file: UploadInput,
    @Body() dto: UploadFileDto,
  ) {
    return this.storage.upload(workspaceId, req.auth.userId, file, dto.folderId);
  }

  @Post('files/scan')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(TempUploadInterceptor())
  uploadScannedFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file: UploadInput,
    @Body() dto: UploadFileDto,
  ) {
    return this.storage.uploadScan(workspaceId, req.auth.userId, file, dto.folderId);
  }

  @Patch('files/:fileId/content')
  @UseInterceptors(TempUploadInterceptor())
  replaceFileContent(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @UploadedFile() file: UploadInput,
    @Body() dto: ReplaceFileContentDto,
  ) {
    return this.storage.replaceContent(workspaceId, req.auth.userId, fileId, file, dto.changeSummary);
  }

  @Get('files/:fileId/download')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() response: Response,
  ) {
    const file = await this.storage.download(workspaceId, req.auth.userId, fileId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }

  @Post('files/:fileId/send')
  @HttpCode(HttpStatus.OK)
  sendFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: SendWorkspaceFileDto,
  ) {
    return this.deliveries.send(workspaceId, req.auth.userId, fileId, dto);
  }

  @Get('file-deliveries')
  listDeliveries(@Req() req: AuthenticatedRequest, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.deliveries.list(workspaceId, req.auth.userId);
  }

  @Get('file-deliveries/:deliveryId/download')
  async downloadDelivery(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Res() response: Response,
  ) {
    const file = await this.deliveries.download(workspaceId, req.auth.userId, deliveryId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }

  @Patch('files/:fileId')
  renameFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: RenameWorkspaceFileDto,
  ) {
    return this.storage.renameFile(workspaceId, req.auth.userId, fileId, dto.name);
  }

  @Post('files/:fileId/move')
  moveFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: MoveWorkspaceFileDto,
  ) {
    return this.storage.moveFile(workspaceId, req.auth.userId, fileId, dto.folderId);
  }

  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.storage.deleteFile(workspaceId, req.auth.userId, fileId);
  }
}
