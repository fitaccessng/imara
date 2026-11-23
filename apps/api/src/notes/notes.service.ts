import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PersonalTaskStatus, StoredFileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, CreatePersonalTaskDto, UpdateNoteDto, UpdatePersonalTaskDto } from './notes.dto';

const fileSelect = { id: true, originalName: true, mimeType: true, sizeBytes: true } as const;
const attachmentFilter = {
  file: { is: { status: StoredFileStatus.READY, deletedAt: null, workspaceId: null, eventId: null, fileRequestId: null } },
} as const;
const noteInclude = { attachments: { where: attachmentFilter, include: { file: { select: fileSelect } } } } as const;
const taskInclude = { attachments: { where: attachmentFilter, include: { file: { select: fileSelect } } } } as const;

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPersonalFiles(userId: string, fileIds?: string[]) {
    const ids = [...new Set(fileIds ?? [])];
    if (!ids.length) return ids;
    const files = await this.prisma.storedFile.findMany({
      where: {
        id: { in: ids }, userId, workspaceId: null, eventId: null, fileRequestId: null,
        status: StoredFileStatus.READY, deletedAt: null,
      },
      select: { id: true },
    });
    if (files.length !== ids.length) {
      throw new BadRequestException('Attachments must be ready, nondeleted personal documents');
    }
    return ids;
  }

  private present<T extends { attachments: Array<{ file: { sizeBytes: bigint } }> }>(item: T) {
    return {
      ...item,
      attachments: item.attachments.map(({ file, ...attachment }) => ({
        ...attachment, file: { ...file, sizeBytes: file.sizeBytes.toString() },
      })),
    };
  }

  private validateTaskValues(status: unknown, progress: unknown) {
    if (status !== undefined && !Object.values(PersonalTaskStatus).includes(status as PersonalTaskStatus)) {
      throw new BadRequestException('Task status is invalid');
    }
    if (progress !== undefined && (!Number.isInteger(progress) || (progress as number) < 0 || (progress as number) > 100)) {
      throw new BadRequestException('Task progress must be an integer from 0 to 100');
    }
  }

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
      include: noteInclude,
    }).then((notes) => notes.map((note) => this.present(note)));
  }

  async create(userId: string, dto: CreateNoteDto) {
    const fileIds = await this.assertPersonalFiles(userId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.personalNote.create({
        data: { userId, title: dto.title, body: dto.body },
      });
      if (fileIds.length) {
        await tx.personalNoteAttachment.createMany({
          data: fileIds.map((fileId) => ({ userId, noteId: note.id, fileId })),
        });
      }
      return this.present(await tx.personalNote.findUniqueOrThrow({ where: { id: note.id }, include: noteInclude }));
    });
  }

  async get(userId: string, id: string) {
    const note = await this.prisma.personalNote.findFirst({
      where: { id, userId },
      include: noteInclude,
    });
    if (!note) throw new NotFoundException('Note not found');
    return this.present(note);
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    if (dto.title === undefined && dto.body === undefined && dto.fileIds === undefined) {
      throw new BadRequestException('At least one of title or body must be provided');
    }

    const fileIds = dto.fileIds === undefined ? undefined : await this.assertPersonalFiles(userId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.personalNote.updateMany({
        where: { id, userId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
        },
      });
      if (!updated.count) throw new NotFoundException('Note not found');
      if (fileIds !== undefined) {
        await tx.personalNoteAttachment.deleteMany({ where: { userId, noteId: id } });
        if (fileIds.length) {
          await tx.personalNoteAttachment.createMany({ data: fileIds.map((fileId) => ({ userId, noteId: id, fileId })) });
        }
      }
      return this.present(await tx.personalNote.findFirstOrThrow({ where: { id, userId }, include: noteInclude }));
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.personalNote.deleteMany({ where: { id, userId } });
    if (!deleted.count) throw new NotFoundException('Note not found');
  }

  async listTasks(userId: string) {
    const tasks = await this.prisma.personalTask.findMany({
      where: { userId }, orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }], include: taskInclude,
    });
    return tasks.map((task) => this.present(task));
  }

  async getTask(userId: string, id: string) {
    const task = await this.prisma.personalTask.findFirst({
      where: { id, userId },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.present(task);
  }

  async createTask(userId: string, dto: CreatePersonalTaskDto) {
    this.validateTaskValues(dto.status, dto.progress);
    const fileIds = await this.assertPersonalFiles(userId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.personalTask.create({
        data: {
          userId, creatorId: userId, title: dto.title,
          description: dto.description?.trim() || null,
          status: dto.status, progress: dto.progress, dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });
      if (fileIds.length) {
        await tx.personalTaskAttachment.createMany({
          data: fileIds.map((fileId) => ({ userId, taskId: task.id, fileId })),
        });
      }
      return this.present(await tx.personalTask.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude }));
    });
  }

  async updateTask(userId: string, id: string, dto: UpdatePersonalTaskDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('At least one task field must be provided');
    this.validateTaskValues(dto.status, dto.progress);
    const fileIds = dto.fileIds === undefined ? undefined : await this.assertPersonalFiles(userId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.personalTask.updateMany({
        where: { id, userId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
        },
      });
      if (!updated.count) throw new NotFoundException('Task not found');
      if (fileIds !== undefined) {
        await tx.personalTaskAttachment.deleteMany({ where: { userId, taskId: id } });
        if (fileIds.length) {
          await tx.personalTaskAttachment.createMany({ data: fileIds.map((fileId) => ({ userId, taskId: id, fileId })) });
        }
      }
      return this.present(await tx.personalTask.findFirstOrThrow({ where: { id, userId }, include: taskInclude }));
    });
  }

  async deleteTask(userId: string, id: string) {
    const result = await this.prisma.personalTask.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Task not found');
  }
}
