import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { StoredFileStatus, WorkspaceMemberStatus, WorkspaceTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceSubscriptionService } from '../subscriptions/workspace-subscription.service';
import { WorkspacesService } from './workspaces.service';
import {
  CreateWorkspaceNoteDto, CreateWorkspaceTaskDto, UpdateWorkspaceNoteDto, UpdateWorkspaceTaskDto,
} from './productivity.dto';

const fileSelect = { id: true, originalName: true, mimeType: true, sizeBytes: true } as const;
const noteInclude = { attachments: { include: { file: { select: fileSelect } } } } as const;
const taskInclude = {
  attachments: { include: { file: { select: fileSelect } } },
  assignee: { select: { user: { select: { id: true, name: true, email: true } } } },
} as const;

@Injectable()
export class ProductivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly subscriptions: WorkspaceSubscriptionService,
  ) {}

  private async authorize(workspaceId: string, userId: string, write = false) {
    const membership = await this.workspaces.authorizeWorkspace(workspaceId, userId);
    if (membership.status !== WorkspaceMemberStatus.ACTIVE) throw new NotFoundException('Workspace not found');
    if (write) await this.subscriptions.requireWriteAccess(workspaceId);
  }

  private async assertFiles(workspaceId: string, fileIds: string[] | undefined) {
    const ids = [...new Set(fileIds ?? [])];
    if (!ids.length) return ids;
    const files = await this.prisma.storedFile.findMany({
      where: {
        id: { in: ids },
        workspaceId,
        status: StoredFileStatus.READY,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (files.length !== ids.length) {
      throw new BadRequestException('Attachments must be available documents in this workspace');
    }
    return ids;
  }

  private async assertAssignee(workspaceId: string, assigneeUserId: string | null | undefined) {
    if (!assigneeUserId) return null;
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: assigneeUserId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true },
    });
    if (!member) throw new BadRequestException('Assignee must be an active member of this workspace');
    return assigneeUserId;
  }

  private validateTaskValues(status: unknown, progress: unknown) {
    if (status !== undefined && !Object.values(WorkspaceTaskStatus).includes(status as WorkspaceTaskStatus)) {
      throw new BadRequestException('Task status is invalid');
    }
    if (progress !== undefined && (!Number.isInteger(progress) || (progress as number) < 0 || (progress as number) > 100)) {
      throw new BadRequestException('Task progress must be an integer from 0 to 100');
    }
  }

  private presentAttachments<T extends { attachments: Array<{ file: { sizeBytes: bigint } }> }>(item: T) {
    return {
      ...item,
      attachments: item.attachments.map(({ file, ...attachment }) => ({
        ...attachment,
        file: { ...file, sizeBytes: file.sizeBytes.toString() },
      })),
    };
  }

  private async replaceNoteFiles(workspaceId: string, noteId: string, fileIds: string[]) {
    await this.prisma.workspaceNoteAttachment.deleteMany({ where: { workspaceId, noteId } });
    if (fileIds.length) {
      await this.prisma.workspaceNoteAttachment.createMany({
        data: fileIds.map((fileId) => ({ workspaceId, noteId, fileId })),
      });
    }
  }

  private async replaceTaskFiles(workspaceId: string, taskId: string, fileIds: string[]) {
    await this.prisma.workspaceTaskAttachment.deleteMany({ where: { workspaceId, taskId } });
    if (fileIds.length) {
      await this.prisma.workspaceTaskAttachment.createMany({
        data: fileIds.map((fileId) => ({ workspaceId, taskId, fileId })),
      });
    }
  }

  async listNotes(workspaceId: string, userId: string) {
    await this.authorize(workspaceId, userId);
    const notes = await this.prisma.workspaceNote.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: noteInclude,
    });
    return notes.map((note) => this.presentAttachments(note));
  }

  async createNote(workspaceId: string, userId: string, dto: CreateWorkspaceNoteDto) {
    await this.authorize(workspaceId, userId, true);
    const fileIds = await this.assertFiles(workspaceId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.workspaceNote.create({
        data: { workspaceId, authorId: userId, title: dto.title, body: dto.body },
      });
      if (fileIds.length) {
        await tx.workspaceNoteAttachment.createMany({
          data: fileIds.map((fileId) => ({ workspaceId, noteId: note.id, fileId })),
        });
      }
      const created = await tx.workspaceNote.findUniqueOrThrow({ where: { id: note.id }, include: noteInclude });
      return this.presentAttachments(created);
    });
  }

  async updateNote(workspaceId: string, userId: string, noteId: string, dto: UpdateWorkspaceNoteDto) {
    await this.authorize(workspaceId, userId, true);
    if (dto.title === undefined && dto.body === undefined && dto.fileIds === undefined) {
      throw new BadRequestException('At least one note field must be provided');
    }
    const fileIds = dto.fileIds === undefined ? undefined : await this.assertFiles(workspaceId, dto.fileIds);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspaceNote.updateMany({
        where: { id: noteId, workspaceId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.body !== undefined ? { body: dto.body } : {}),
        },
      });
      if (!updated.count) throw new NotFoundException('Note not found');
      if (fileIds !== undefined) {
        await tx.workspaceNoteAttachment.deleteMany({ where: { workspaceId, noteId } });
        if (fileIds.length) {
          await tx.workspaceNoteAttachment.createMany({
            data: fileIds.map((fileId) => ({ workspaceId, noteId, fileId })),
          });
        }
      }
      const updatedNote = await tx.workspaceNote.findFirstOrThrow({
        where: { id: noteId, workspaceId }, include: noteInclude,
      });
      return this.presentAttachments(updatedNote);
    });
  }

  async deleteNote(workspaceId: string, userId: string, noteId: string) {
    await this.authorize(workspaceId, userId, true);
    const result = await this.prisma.workspaceNote.deleteMany({ where: { id: noteId, workspaceId } });
    if (!result.count) throw new NotFoundException('Note not found');
  }

  async listTasks(workspaceId: string, userId: string) {
    await this.authorize(workspaceId, userId);
    const tasks = await this.prisma.workspaceTask.findMany({
      where: { workspaceId },
      orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      include: taskInclude,
    });
    return tasks.map((task) => this.presentAttachments(task));
  }

  async createTask(workspaceId: string, userId: string, dto: CreateWorkspaceTaskDto) {
    await this.authorize(workspaceId, userId, true);
    this.validateTaskValues(dto.status, dto.progress);
    const [fileIds, assigneeUserId] = await Promise.all([
      this.assertFiles(workspaceId, dto.fileIds),
      this.assertAssignee(workspaceId, dto.assigneeUserId),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workspaceTask.create({
        data: {
          workspaceId,
          creatorId: userId,
          title: dto.title,
          description: dto.description?.trim() || null,
          status: dto.status,
          progress: dto.progress,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          assigneeUserId,
        },
      });
      if (fileIds.length) {
        await tx.workspaceTaskAttachment.createMany({
          data: fileIds.map((fileId) => ({ workspaceId, taskId: task.id, fileId })),
        });
      }
      const created = await tx.workspaceTask.findUniqueOrThrow({ where: { id: task.id }, include: taskInclude });
      return this.presentAttachments(created);
    });
  }

  async updateTask(workspaceId: string, userId: string, taskId: string, dto: UpdateWorkspaceTaskDto) {
    await this.authorize(workspaceId, userId, true);
    if (!Object.keys(dto).length) throw new BadRequestException('At least one task field must be provided');
    this.validateTaskValues(dto.status, dto.progress);
    const [fileIds, assigneeUserId] = await Promise.all([
      dto.fileIds === undefined ? undefined : this.assertFiles(workspaceId, dto.fileIds),
      dto.assigneeUserId === undefined ? undefined : this.assertAssignee(workspaceId, dto.assigneeUserId),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspaceTask.updateMany({
        where: { id: taskId, workspaceId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.progress !== undefined ? { progress: dto.progress } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          ...(dto.assigneeUserId !== undefined ? { assigneeUserId: assigneeUserId ?? null } : {}),
        },
      });
      if (!updated.count) throw new NotFoundException('Task not found');
      if (fileIds !== undefined) {
        await tx.workspaceTaskAttachment.deleteMany({ where: { workspaceId, taskId } });
        if (fileIds.length) {
          await tx.workspaceTaskAttachment.createMany({
            data: fileIds.map((fileId) => ({ workspaceId, taskId, fileId })),
          });
        }
      }
      const updatedTask = await tx.workspaceTask.findFirstOrThrow({
        where: { id: taskId, workspaceId }, include: taskInclude,
      });
      return this.presentAttachments(updatedTask);
    });
  }

  async deleteTask(workspaceId: string, userId: string, taskId: string) {
    await this.authorize(workspaceId, userId, true);
    const result = await this.prisma.workspaceTask.deleteMany({ where: { id: taskId, workspaceId } });
    if (!result.count) throw new NotFoundException('Task not found');
  }
}
