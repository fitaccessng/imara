import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './notes.dto';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, search?: string) {
    const term = search?.trim();
    return this.prisma.personalNote.findMany({
      where: {
        userId,
        ...(term
          ? {
              OR: [
                { title: { contains: term, mode: 'insensitive' } },
                { body: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, title: true, body: true, createdAt: true, updatedAt: true },
    });
  }

  create(userId: string, dto: CreateNoteDto) {
    return this.prisma.personalNote.create({
      data: { userId, title: dto.title, body: dto.body },
      select: { id: true, title: true, body: true, createdAt: true, updatedAt: true },
    });
  }

  async get(userId: string, id: string) {
    const note = await this.prisma.personalNote.findFirst({
      where: { id, userId },
      select: { id: true, title: true, body: true, createdAt: true, updatedAt: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    if (dto.title === undefined && dto.body === undefined) {
      throw new BadRequestException('At least one of title or body must be provided');
    }

    const updated = await this.prisma.personalNote.updateMany({
      where: { id, userId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
      },
    });
    if (!updated.count) throw new NotFoundException('Note not found');
    return this.get(userId, id);
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.personalNote.deleteMany({ where: { id, userId } });
    if (!deleted.count) throw new NotFoundException('Note not found');
  }
}
