import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post,
  Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateFolderDto, RenameFolderDto, UploadFileDto } from '../storage/storage.dto';
import { getMaxUploadBytes, UploadInput } from '../storage/storage.service';
import { MoveWorkspaceFileDto, RenameWorkspaceFileDto } from './workspace-storage.dto';
import { WorkspaceStorageService } from './workspace-storage.service';

@Controller('workspaces/:workspaceId')
@UseGuards(SessionGuard)
export class WorkspaceStorageController {
  constructor(private readonly storage: WorkspaceStorageService) {}

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
    @Body() dto: CreateFolderDto,
  ) {
    return this.storage.createFolder(workspaceId, req.auth.userId, dto.name, dto.parentFolderId);
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  uploadScannedFile(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file: UploadInput,
    @Body() dto: UploadFileDto,
  ) {
    return this.storage.uploadScan(workspaceId, req.auth.userId, file, dto.folderId);
  }

  @Patch('files/:fileId/content')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  replaceFileContent(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @UploadedFile() file: UploadInput,
  ) {
    return this.storage.replaceContent(workspaceId, req.auth.userId, fileId, file);
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
