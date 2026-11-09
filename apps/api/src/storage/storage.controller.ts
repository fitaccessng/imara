import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateFolderDto, MoveFolderDto, RenameFolderDto, SearchFilesDto, UpdateFavoriteDto, UpdateFileOrganizationDto, UploadFileDto } from './storage.dto';
import { getMaxUploadBytes, StorageService, type UploadInput } from './storage.service';

@Controller()
@UseGuards(SessionGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('files')
  listFiles(
    @Req() req: AuthenticatedRequest,
    @Query('folderId', new ParseUUIDPipe({ version: '4', optional: true })) folderId?: string,
  ) {
    return this.storage.list(req.auth.userId, folderId);
  }

  @Get('search')
  searchFiles(@Req() req: AuthenticatedRequest, @Query() dto: SearchFilesDto) {
    return this.storage.search(req.auth.userId, dto.q);
  }

  @Get('files/favorites')
  listFavorites(@Req() req: AuthenticatedRequest) {
    return this.storage.listFavorites(req.auth.userId);
  }

  @Get('files/smart-library')
  smartLibrary(@Req() req: AuthenticatedRequest) {
    return this.storage.smartLibrary(req.auth.userId);
  }

  @Get('files/duplicates')
  duplicateFiles(@Req() req: AuthenticatedRequest) {
    return this.storage.duplicateGroups(req.auth.userId);
  }

  @Patch('files/:id/organization')
  updateOrganization(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFileOrganizationDto,
  ) {
    return this.storage.updateOrganization(req.auth.userId, id, dto);
  }

  @Get('files/trash')
  listTrash(@Req() req: AuthenticatedRequest) {
    return this.storage.listTrash(req.auth.userId);
  }

  @Patch('files/:id/favorite')
  setFavorite(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFavoriteDto,
  ) {
    return this.storage.setFavorite(req.auth.userId, id, dto.isFavorite);
  }

  @Post('files/:id/restore')
  restoreFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storage.restoreFile(req.auth.userId, id);
  }

  @Delete('files/:id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentlyDeleteFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storage.permanentlyDeleteFile(req.auth.userId, id);
  }

  @Post('files')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  uploadFile(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: UploadInput,
    @Body() dto: UploadFileDto,
  ) {
    return this.storage.upload(req.auth.userId, file, dto.folderId);
  }

  @Post('files/scan')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  uploadScannedFile(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: UploadInput,
    @Body() dto: UploadFileDto,
  ) {
    return this.storage.uploadScan(req.auth.userId, file, dto.folderId);
  }

  @Patch('files/:id/content')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: getMaxUploadBytes(), files: 1 } }))
  replaceFileContent(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: UploadInput,
  ) {
    return this.storage.replaceContent(req.auth.userId, id, file);
  }

  @Get('files/:id/download')
  async downloadFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ) {
    const file = await this.storage.download(req.auth.userId, id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    file.body.pipe(response);
  }

  @Delete('files/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storage.deleteFile(req.auth.userId, id);
  }

  @Get('folders')
  listFolders(
    @Req() req: AuthenticatedRequest,
    @Query('parentFolderId', new ParseUUIDPipe({ version: '4', optional: true })) parentFolderId?: string,
  ) {
    return this.storage.listFolders(req.auth.userId, parentFolderId);
  }

  @Get('folders/tree')
  listFolderTree(@Req() req: AuthenticatedRequest) {
    return this.storage.listFolderTree(req.auth.userId);
  }

  @Get('folders/:id')
  getFolder(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storage.getFolder(req.auth.userId, id);
  }

  @Post('folders')
  createFolder(@Req() req: AuthenticatedRequest, @Body() dto: CreateFolderDto) {
    return this.storage.createFolder(req.auth.userId, dto.name, dto.parentFolderId);
  }

  @Patch('folders/:id')
  renameFolder(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.storage.renameFolder(req.auth.userId, id, dto.name);
  }

  @Post('folders/:id/move')
  moveFolder(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.storage.moveFolder(req.auth.userId, id, dto.parentFolderId);
  }

  @Delete('folders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFolder(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storage.deleteFolder(req.auth.userId, id);
  }
}
