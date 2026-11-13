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
  const prisma = {
    personalNote: { findMany, findFirst, create, updateMany, deleteMany },
  };
  const service = new NotesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists only the authenticated user’s notes and searches both title and body', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.list('user-a', 'Budget')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        OR: [
          { title: { contains: 'Budget', mode: 'insensitive' } },
          { body: { contains: 'Budget', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { id: true, title: true, body: true, createdAt: true, updatedAt: true },
    });
  });

  it('creates a note with server-supplied ownership and selected personal fields only', async () => {
    const note = { id: 'note-id', title: 'Plan', body: 'Details', createdAt: new Date(), updatedAt: new Date() };
    create.mockResolvedValue(note);
    await expect(service.create('user-a', { title: note.title, body: note.body })).resolves.toBe(note);
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-a', title: 'Plan', body: 'Details' },
      select: { id: true, title: true, body: true, createdAt: true, updatedAt: true },
    });
  });

  it('does not disclose or mutate another user’s note', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.get('user-a', 'note-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'note-id', userId: 'user-a' } }));

    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update('user-a', 'note-id', { title: 'Changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'note-id', userId: 'user-a' },
      data: { title: 'Changed' },
    });

    deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('user-a', 'note-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'note-id', userId: 'user-a' } });
  });

  it('requires at least one field when updating', async () => {
    await expect(service.update('user-a', 'note-id', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
