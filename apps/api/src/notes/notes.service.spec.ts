jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';

describe('NotesService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const updateMany = jest.fn();
  const deleteMany = jest.fn();
  const storedFileFindMany = jest.fn();
  const noteCreateMany = jest.fn();
  const noteDeleteMany = jest.fn();
  const noteFindUniqueOrThrow = jest.fn();
  const noteFindFirstOrThrow = jest.fn();
  const taskCreate = jest.fn();
  const taskFindUniqueOrThrow = jest.fn();
  const taskUpdateMany = jest.fn();
  const taskDeleteMany = jest.fn();
  const taskFindFirstOrThrow = jest.fn();
  const taskFindFirst = jest.fn();
  const taskFindMany = jest.fn();
  const taskAttachmentCreateMany = jest.fn();
  const taskAttachmentDeleteMany = jest.fn();
  const tx = {
    personalNote: { create, updateMany, findUniqueOrThrow: noteFindUniqueOrThrow, findFirstOrThrow: noteFindFirstOrThrow },
    personalNoteAttachment: { createMany: noteCreateMany, deleteMany: noteDeleteMany },
    personalTask: {
      create: taskCreate, findUniqueOrThrow: taskFindUniqueOrThrow, updateMany: taskUpdateMany,
      deleteMany: taskDeleteMany, findFirstOrThrow: taskFindFirstOrThrow, findMany: taskFindMany,
      findFirst: taskFindFirst,
    },
    personalTaskAttachment: { createMany: taskAttachmentCreateMany, deleteMany: taskAttachmentDeleteMany },
  };
  const prisma = {
    personalNote: { findMany, findFirst, updateMany, deleteMany },
    personalTask: { findMany: taskFindMany, findFirst: taskFindFirst, deleteMany: taskDeleteMany },
    storedFile: { findMany: storedFileFindMany },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new NotesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists only the authenticated user’s notes and preserves title/body search', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.list('user-a', 'Budget')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'user-a',
        OR: [
          { title: { contains: 'Budget', mode: 'insensitive' } },
          { body: { contains: 'Budget', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: expect.objectContaining({ attachments: expect.any(Object) }),
    }));
  });

  it('allows only ready, nondeleted personal files as note attachments', async () => {
    storedFileFindMany.mockResolvedValue([]);
    await expect(service.create('user-a', {
      title: 'Plan', body: 'Details', fileIds: ['foreign-file'],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(storedFileFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['foreign-file'] }, userId: 'user-a', workspaceId: null, eventId: null,
        fileRequestId: null, status: 'READY', deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('creates a note with authorized attachments and exposes safe metadata', async () => {
    const date = new Date();
    storedFileFindMany.mockResolvedValue([{ id: 'file-a' }]);
    create.mockResolvedValue({ id: 'note-a' });
    noteCreateMany.mockResolvedValue({ count: 1 });
    noteFindUniqueOrThrow.mockResolvedValue({
      id: 'note-a', title: 'Plan', body: 'Details', createdAt: date, updatedAt: date,
      attachments: [{
        userId: 'user-a', noteId: 'note-a', fileId: 'file-a', createdAt: date,
        file: { id: 'file-a', originalName: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: 123n },
      }],
    });

    const result = await service.create('user-a', { title: 'Plan', body: 'Details', fileIds: ['file-a'] });
    expect(noteCreateMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-a', noteId: 'note-a', fileId: 'file-a' }],
    });
    expect(result.attachments[0].file).toEqual({
      id: 'file-a', originalName: 'plan.pdf', mimeType: 'application/pdf', sizeBytes: '123',
    });
  });

  it('creates personal tasks with status, progress, due date and owned attachments', async () => {
    const date = new Date();
    storedFileFindMany.mockResolvedValue([{ id: 'file-a' }]);
    taskCreate.mockResolvedValue({ id: 'task-a' });
    taskAttachmentCreateMany.mockResolvedValue({ count: 1 });
    taskFindUniqueOrThrow.mockResolvedValue({
      id: 'task-a', title: 'Review', status: 'IN_PROGRESS', progress: 40, dueAt: date,
      attachments: [{
        userId: 'user-a', taskId: 'task-a', fileId: 'file-a', createdAt: date,
        file: { id: 'file-a', originalName: 'brief.pdf', mimeType: 'application/pdf', sizeBytes: 42n },
      }],
    });

    const result = await service.createTask('user-a', {
      title: 'Review', status: 'IN_PROGRESS', progress: 40, dueAt: date.toISOString(), fileIds: ['file-a'],
    });
    expect(taskCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-a', creatorId: 'user-a', status: 'IN_PROGRESS', progress: 40, dueAt: date,
      }),
    }));
    expect(result.attachments[0].file.sizeBytes).toBe('42');
  });

  it('rejects invalid personal task status or progress', async () => {
    await expect(service.createTask('user-a', { title: 'Bad status', status: 'UNKNOWN' as never }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateTask('user-a', 'task-a', { progress: -1 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(taskCreate).not.toHaveBeenCalled();
    expect(taskUpdateMany).not.toHaveBeenCalled();
  });

  it('does not disclose another user’s task', async () => {
    taskFindFirst.mockResolvedValue(null);
    await expect(service.getTask('user-a', 'task-from-user-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(taskFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-from-user-b', userId: 'user-a' },
    }));
  });

  it('does not disclose or mutate another user’s note', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.get('user-a', 'note-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'note-id', userId: 'user-a' } }));

    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update('user-a', 'note-id', { title: 'Changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'note-id', userId: 'user-a' },
      data: { title: 'Changed' },
    }));

    deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('user-a', 'note-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'note-id', userId: 'user-a' } });
  });

  it('requires at least one note field when updating', async () => {
    await expect(service.update('user-a', 'note-id', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
