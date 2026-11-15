jest.mock('@nestjs/common', () => {
  class MockHttpException extends Error {}
  return {
    Injectable: () => (target: unknown) => target,
    BadRequestException: MockHttpException,
    NotFoundException: MockHttpException,
  };
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PersonalDocumentType } from '@prisma/client';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      personalDocument: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      personalDocumentResponse: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new DocumentsService(prisma);
  });

  it('creates valid form drafts while collecting respondent identity on submission', async () => {
    prisma.personalDocument.create.mockResolvedValue({ id: 'document-id' });
    const form = {
      questions: [{
        id: 'q1', prompt: 'What do you think?', type: 'SHORT_ANSWER', required: true,
      }],
    };

    await service.create('owner-id', {
      type: PersonalDocumentType.FORM, title: 'Feedback', content: form,
    });

    expect(prisma.personalDocument.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerId: 'owner-id', type: 'FORM', content: form }),
    }));
    await expect(service.create('owner-id', {
      type: PersonalDocumentType.FORM,
      title: 'Duplicate IDs',
      content: { questions: [
        { id: 'same', prompt: 'One', type: 'SHORT_ANSWER', required: false },
        { id: 'same', prompt: 'Two', type: 'SHORT_ANSWER', required: false },
      ] },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts blank agreement and invoice drafts, but requires complete content to publish', async () => {
    prisma.personalDocument.create.mockResolvedValue({ id: 'draft-id' });
    await expect(service.create('owner-id', {
      type: PersonalDocumentType.AGREEMENT,
      title: 'Untitled agreement',
      content: { body: '' },
    })).resolves.toMatchObject({ id: 'draft-id' });
    await expect(service.create('owner-id', {
      type: PersonalDocumentType.INVOICE,
      title: 'Untitled invoice',
      content: {},
    })).resolves.toMatchObject({ id: 'draft-id' });

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'agreement-id',
      ownerId: 'owner-id',
      type: PersonalDocumentType.AGREEMENT,
      content: { body: '' },
      published: false,
      publishedAt: null,
      updatedAt: new Date(),
      tokenHash: null,
      revokedAt: null,
    });
    await expect(service.update('owner-id', 'agreement-id', { published: true }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.personalDocument.update).not.toHaveBeenCalled();

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'invoice-id',
      ownerId: 'owner-id',
      type: PersonalDocumentType.INVOICE,
      content: {},
      published: false,
      publishedAt: null,
      updatedAt: new Date(),
      tokenHash: null,
      revokedAt: null,
    });
    await expect(service.update('owner-id', 'invoice-id', { published: true }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.personalDocument.update).not.toHaveBeenCalled();
  });

  it('saves in-progress form questions but rejects incomplete prompts or choices on publish', async () => {
    prisma.personalDocument.create.mockResolvedValue({ id: 'form-draft' });
    await expect(service.create('owner-id', {
      type: PersonalDocumentType.FORM,
      title: 'Draft form',
      content: {
        questions: [{
          id: 'q1', prompt: '', type: 'MULTIPLE_CHOICE', required: true, choices: [],
        }],
      },
    })).resolves.toMatchObject({ id: 'form-draft' });

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'form-draft', ownerId: 'owner-id', type: PersonalDocumentType.FORM,
      content: { questions: [{ id: 'q1', prompt: '', type: 'MULTIPLE_CHOICE', required: true, choices: [] }] },
      published: false, publishedAt: null, updatedAt: new Date(), tokenHash: null, revokedAt: null,
    });
    await expect(service.update('owner-id', 'form-draft', { published: true }))
      .rejects.toBeInstanceOf(BadRequestException);

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'form-draft', ownerId: 'owner-id', type: PersonalDocumentType.FORM,
      content: { questions: [{ id: 'q1', prompt: 'Choose one', type: 'MULTIPLE_CHOICE', required: true, choices: [] }] },
      published: false, publishedAt: null, updatedAt: new Date(), tokenHash: null, revokedAt: null,
    });
    await expect(service.update('owner-id', 'form-draft', { published: true }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes complete agreements and invoices', async () => {
    const now = new Date();
    const completeAgreement = {
      id: 'agreement-id', ownerId: 'owner-id', type: PersonalDocumentType.AGREEMENT,
      content: { body: 'Agreement terms' }, published: false, publishedAt: null,
      updatedAt: now, tokenHash: null, revokedAt: null,
    };
    prisma.personalDocument.findFirst
      .mockResolvedValueOnce(completeAgreement)
      .mockResolvedValueOnce({ ...completeAgreement, published: true, publishedAt: now });
    prisma.personalDocument.update.mockResolvedValue({});
    prisma.personalDocumentResponse.count.mockResolvedValue(0);

    await expect(service.update('owner-id', 'agreement-id', { published: true }))
      .resolves.toMatchObject({ published: true });

    const completeInvoice = {
      id: 'invoice-id', ownerId: 'owner-id', type: PersonalDocumentType.INVOICE,
      content: {
        businessName: 'Studio', customerName: 'Customer', customerEmail: 'customer@example.com',
        invoiceNumber: 'INV-1', issueDate: '2026-01-01', dueDate: '2026-01-31',
        currency: 'USD', note: '',
        lineItems: [{ description: 'Work', quantity: 1, unitPrice: 10 }],
      },
      published: false, publishedAt: null, updatedAt: now, tokenHash: null, revokedAt: null,
    };
    prisma.personalDocument.findFirst
      .mockResolvedValueOnce(completeInvoice)
      .mockResolvedValueOnce({ ...completeInvoice, published: true, publishedAt: now });
    await expect(service.update('owner-id', 'invoice-id', { published: true }))
      .resolves.toMatchObject({ published: true });
    expect(prisma.personalDocument.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ published: true }),
    }));
  });

  it('stores valid form answers with the respondent name and normalized email', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'document-id',
      type: PersonalDocumentType.FORM,
      content: { questions: [{ id: 'q1', type: 'MULTIPLE_CHOICE', required: true, choices: ['Yes', 'No'] }] },
    });
    prisma.personalDocumentResponse.create.mockResolvedValue({ id: 'response-id', submittedAt: new Date() });

    await service.submitForm('a'.repeat(43), {
      name: '  Sam Example ',
      email: 'SAM@example.com',
      answers: { q1: 'Yes' },
    });

    expect(prisma.personalDocumentResponse.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        respondentName: 'Sam Example',
        respondentEmail: 'sam@example.com',
        answers: { q1: 'Yes' },
      }),
    }));
  });

  it('rejects invalid tokens, missing required answers and cross-type submissions', async () => {
    await expect(service.getPublic('bad-token')).rejects.toBeInstanceOf(NotFoundException);
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'document-id',
      type: PersonalDocumentType.FORM,
      content: { questions: [{ id: 'q1', type: 'SHORT_ANSWER', required: true }] },
    });
    await expect(service.submitForm('a'.repeat(43), {
      name: 'Sam',
      email: 'sam@example.com',
      answers: {},
    })).rejects.toBeInstanceOf(BadRequestException);

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'document-id', type: PersonalDocumentType.AGREEMENT, content: { body: 'Terms' },
    });
    await expect(service.submitForm('a'.repeat(43), {
      name: 'Sam',
      email: 'sam@example.com',
      answers: {},
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns computed invoice amounts and never trusts submitted totals', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'invoice-id',
      type: PersonalDocumentType.INVOICE,
      title: 'Invoice',
      description: null,
      content: {
        businessName: 'Studio',
        customerName: 'Customer',
        customerEmail: 'customer@example.com',
        invoiceNumber: 'INV-1',
        issueDate: '2026-01-01',
        dueDate: '2026-01-31',
        currency: 'USD',
        lineItems: [{ description: 'Work', quantity: 2, unitPrice: 12.5 }],
        note: '',
        total: 0.01,
      },
    });

    const result = await service.getPublic('a'.repeat(43));
    expect(result.content).toMatchObject({
      lineItems: [{ total: 25 }],
      total: 25,
    });
    expect(result.content).not.toHaveProperty('total', 0.01);
  });

  it('records agreement consent and signing metadata', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'agreement-id', type: PersonalDocumentType.AGREEMENT, content: { body: 'Terms' },
    });

    prisma.personalDocumentResponse.create.mockResolvedValue({ id: 'signature-id' });

    await expect(service.signAgreement('a'.repeat(43), {
      name: 'Signer',
      email: 'signer@example.com',
      consent: false,
    }, {})).rejects.toBeInstanceOf(BadRequestException);

    await service.signAgreement('a'.repeat(43), {
      name: 'Signer',
      email: 'signer@example.com',
      consent: true,
    }, { ipAddress: '127.0.0.1', userAgent: 'test-agent' });

    expect(prisma.personalDocumentResponse.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        consent: true,
        signedAt: expect.any(Date),
        signedName: 'Signer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    }));
  });

  it('counts completed agreement signatures as the agreement response count', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'agreement-id', ownerId: 'owner-id', type: PersonalDocumentType.AGREEMENT,
      content: { body: 'Terms' }, published: true, publishedAt: new Date(),
      tokenHash: 'a'.repeat(64), revokedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    prisma.personalDocumentResponse.count.mockResolvedValue(2);

    await expect(service.get('owner-id', 'agreement-id'))
      .resolves.toMatchObject({ responseCount: 2 });
    expect(prisma.personalDocumentResponse.count).toHaveBeenCalledWith({
      where: { documentId: 'agreement-id', signedAt: { not: null } },
    });
  });

  it('returns agreement signer records without network metadata and rejects invoice responses', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'agreement-id', ownerId: 'owner-id', type: PersonalDocumentType.AGREEMENT,
    });
    const submittedAt = new Date();
    const signedAt = new Date();
    prisma.personalDocumentResponse.findMany.mockResolvedValue([{
      id: 'signature-id',
      respondentName: 'Signer',
      respondentEmail: 'signer@example.com',
      answers: null,
      submittedAt,
      signedAt,
      signedName: 'Typed Signer',
      consent: true,
      ipAddress: '127.0.0.1',
      userAgent: 'private-agent',
    }]);

    await expect(service.responses('owner-id', 'agreement-id')).resolves.toEqual([{
      id: 'signature-id',
      name: 'Signer',
      email: 'signer@example.com',
      submittedAt,
      signedAt,
      signedName: 'Typed Signer',
      consent: true,
    }]);
    expect(prisma.personalDocumentResponse.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId: 'agreement-id', signedAt: { not: null } },
      select: expect.not.objectContaining({ ipAddress: true, userAgent: true }),
    }));

    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'invoice-id', ownerId: 'owner-id', type: PersonalDocumentType.INVOICE,
    });
    await expect(service.responses('owner-id', 'invoice-id'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the share token once while storing only its hash', async () => {
    prisma.personalDocument.findFirst.mockResolvedValue({
      id: 'document-id',
      ownerId: 'owner-id',
      type: PersonalDocumentType.AGREEMENT,
      content: { body: 'Terms' },
      updatedAt: new Date(),
    });
    prisma.personalDocument.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.share('owner-id', 'document-id');

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.personalDocument.updateMany.mock.calls[0][0].data.tokenHash).toHaveLength(64);
    expect(prisma.personalDocument.updateMany.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
    expect(prisma.personalDocument.updateMany.mock.calls[0][0].data.published).toBe(true);
  });
});
