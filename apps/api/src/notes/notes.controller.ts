import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateNoteDto, ListNotesQueryDto, UpdateNoteDto } from './notes.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(SessionGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListNotesQueryDto) {
    return this.notes.list(req.auth.userId, query.search);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateNoteDto) {
    return this.notes.create(req.auth.userId, dto);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notes.get(req.auth.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(req.auth.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notes.delete(req.auth.userId, id);
  }
}
