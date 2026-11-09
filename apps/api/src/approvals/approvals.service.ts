import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalDecision,
  ApprovalRequestStatus,
  ApprovalReviewMode,
  Prisma,
  StoredFileStatus,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ApprovalAction, CreateApprovalRequestDto, CreateApprovalTemplateDto } from './approvals.dto';

type ApprovalView = 'mine' | 'pending' | 'history';
type ApprovalTransaction = Prisma.TransactionClient;
const APPROVAL_DECISIONS: Record<ApprovalAction, ApprovalDecision> = {
  [ApprovalAction.APPROVED]: ApprovalDecision.APPROVED,
  [ApprovalAction.REJECTED]: ApprovalDecision.REJECTED,
  [ApprovalAction.CHANGES_REQUESTED]: ApprovalDecision.CHANGES_REQUESTED,
};

const REQUEST_SUMMARY = {
  requester: { select: { id: true, name: true } },
  template: { select: { id: true, name: true } },
  steps: {
    orderBy: { stepOrder: 'asc' as const },
    include: {
      approvers: {
        include: {
          member: {
            select: { id: true, userId: true, displayName: true, role: true, user: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    include: { file: { select: { id: true, status: true, deletedAt: true } } },
  },
} satisfies Prisma.ApprovalRequestInclude;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private cleanText(value: string | undefined): string | undefined {
    const text = value?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    return text || undefined;
  }

  private requireText(value: string | undefined, label: string): string {
    const text = this.cleanText(value);
    if (!text) throw new BadRequestException(`${label} is required`);
    return text;
  }

  private async membership(workspaceId: string, userId: string) {
    return this.workspaces.authorizeWorkspace(workspaceId, userId);
  }

  private async requireAdministrator(workspaceId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    if (member.role !== WorkspaceRole.OWNER && member.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Workspace administrator access required');
    }
    return member;
  }

  private async validateTemplateSteps(
    workspaceId: string,
    steps: CreateApprovalTemplateDto['steps'],
  ) {
    const memberIds = [...new Set(steps.flatMap((step) => step.approverMemberIds))];
    if (steps.some((step) =>
      step.mode === ApprovalReviewMode.SEQUENTIAL && step.approverMemberIds.length !== 1)) {
      throw new BadRequestException('Sequential steps must have exactly one approver; use multiple steps for an ordered chain');
    }
    const members = await this.prisma.workspaceMember.findMany({
      where: { id: { in: memberIds }, workspaceId, status: WorkspaceMemberStatus.ACTIVE },
      select: { id: true },
    });
    if (members.length !== memberIds.length) {
      throw new BadRequestException('Every approver must be an active member of this workspace');
    }
  }

  async listTemplates(workspaceId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    const isAdmin = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    return this.prisma.approvalTemplate.findMany({
      where: { workspaceId, ...(isAdmin ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approvers: {
              include: {
                member: {
                  select: { id: true, displayName: true, role: true, user: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
  }

  async createTemplate(workspaceId: string, userId: string, dto: CreateApprovalTemplateDto) {
    await this.requireAdministrator(workspaceId, userId);
    await this.validateTemplateSteps(workspaceId, dto.steps);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.approvalTemplate.create({
        data: {
          workspaceId,
          createdById: userId,
          name: this.requireText(dto.name, 'Template name'),
          description: this.cleanText(dto.description),
          steps: {
            create: dto.steps.map((step, stepOrder) => ({
              stepOrder,
              mode: step.mode,
              approvers: { create: step.approverMemberIds.map((memberId) => ({ memberId })) },
            })),
          },
        },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' },
            include: { approvers: { include: { member: { select: { id: true, displayName: true, role: true } } } } },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'APPROVAL_TEMPLATE_CREATED',
          targetType: 'ApprovalTemplate',
          targetId: template.id,
        },
      });
      return template;
    });
  }

  async updateTemplate(workspaceId: string, templateId: string, userId: string, isActive: boolean) {
    await this.requireAdministrator(workspaceId, userId);
    const updated = await this.prisma.approvalTemplate.updateMany({
      where: { id: templateId, workspaceId },
      data: { isActive },
    });
    if (!updated.count) throw new NotFoundException('Approval template not found');
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorId: userId,
        action: isActive ? 'APPROVAL_TEMPLATE_ACTIVATED' : 'APPROVAL_TEMPLATE_ARCHIVED',
        targetType: 'ApprovalTemplate',
        targetId: templateId,
      },
    });
    return this.prisma.approvalTemplate.findFirstOrThrow({
      where: { id: templateId, workspaceId },
      include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approvers: true } } },
    });
  }

  private async assertFileAccessible(workspaceId: string, userId: string, file: {
    folderId: string | null;
  }): Promise<void> {
    const member = await this.membership(workspaceId, userId);
    if (member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN) return;
    if (!file.folderId) throw new NotFoundException('File not found');
    await this.workspaces.authorizeFolder(workspaceId, userId, file.folderId, 'downloadFiles');
  }

  async createRequest(workspaceId: string, userId: string, dto: CreateApprovalRequestDto) {
    await this.membership(workspaceId, userId);
    const title = this.cleanText(dto.title);
    if (!title) throw new BadRequestException('Request title is required');
    const description = this.cleanText(dto.description);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && dueAt.getTime() <= Date.now()) throw new BadRequestException('The due date must be in the future');

    const template = await this.prisma.approvalTemplate.findFirst({
      where: { id: dto.templateId, workspaceId, isActive: true },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approvers: { include: { member: { select: { id: true, userId: true, status: true } } } } },
        },
      },
    });
    if (!template || !template.steps.length) throw new NotFoundException('Active approval template not found');
    if (template.steps.some((step) => step.approvers.length === 0)) {
      throw new ConflictException('This template has a step without an approver. Ask a workspace administrator to update it.');
    }
    if (template.steps.some((step) =>
      step.approvers.some(({ member: approver }) => approver.status !== WorkspaceMemberStatus.ACTIVE))) {
      throw new ConflictException('This template includes an inactive approver. Ask a workspace administrator to update it.');
    }
    const fileIds = dto.fileIds ?? [];
    const files = fileIds.length
      ? await this.prisma.storedFile.findMany({
        where: {
          id: { in: fileIds },
          workspaceId,
          status: StoredFileStatus.READY,
          deletedAt: null,
          eventId: null,
        },
        select: { id: true, originalName: true, folderId: true },
      })
      : [];
    if (files.length !== fileIds.length) throw new BadRequestException('One or more attached files are unavailable');
    const participantIds = new Set([
      userId,
      ...template.steps.flatMap((step) => step.approvers.map((approver) => approver.member.userId)),
    ]);
    for (const file of files) {
      for (const participantId of participantIds) {
        await this.assertFileAccessible(workspaceId, participantId, file);
      }
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.approvalRequest.create({
        data: {
          workspaceId,
          requesterId: userId,
          templateId: template.id,
          title,
          description,
          dueAt,
          steps: {
            create: template.steps.map((step) => ({
              stepOrder: step.stepOrder,
              mode: step.mode,
              approvers: {
                create: step.approvers.map(({ memberId }) => ({ memberId })),
              },
            })),
          },
          attachments: {
            create: files.map((file) => ({ fileId: file.id, fileName: file.originalName })),
          },
          activities: { create: { actorId: userId, action: 'SUBMITTED' } },
        },
        include: REQUEST_SUMMARY,
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'APPROVAL_REQUEST_SUBMITTED',
          targetType: 'ApprovalRequest',
          targetId: created.id,
        },
      });
      const initialApprovers = template.steps[0].approvers.map(({ member }) => member.userId);
      await this.notify(tx, workspaceId, initialApprovers, 'APPROVAL_ACTION_REQUIRED',
        `Approval required: ${title}`, { requestId: created.id });
      if (dueAt && created.requesterId) {
        await tx.reminder.create({
          data: {
            workspaceId,
            createdById: created.requesterId,
            assignedToId: created.requesterId,
            approvalRequestId: created.id,
            title: `Approval due: ${title}`,
            dueAt,
            nextDueAt: dueAt,
            recurrence: 'ONCE',
          },
        });
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return request;
  }

  async listRequests(workspaceId: string, userId: string, view: ApprovalView = 'mine') {
    const member = await this.membership(workspaceId, userId);
    if (view === 'pending') {
      const assignments = await this.prisma.approvalRequestApprover.findMany({
        where: {
          memberId: member.id,
          decision: ApprovalDecision.PENDING,
          step: { request: { workspaceId, status: ApprovalRequestStatus.IN_PROGRESS } },
        },
        select: { step: { select: { stepOrder: true, requestId: true, request: { select: { currentStepOrder: true } } } } },
      });
      const requestIds = [...new Set(assignments
        .filter(({ step }) => step.stepOrder === step.request.currentStepOrder)
        .map(({ step }) => step.requestId))];
      return this.prisma.approvalRequest.findMany({
        where: { workspaceId, id: { in: requestIds }, status: ApprovalRequestStatus.IN_PROGRESS },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: REQUEST_SUMMARY,
      });
    }
    const where: Prisma.ApprovalRequestWhereInput = view === 'history'
      ? {
        workspaceId,
        OR: [
          { requesterId: userId },
          { steps: { some: { approvers: { some: { memberId: member.id } } } } },
        ],
        status: { in: [ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED, ApprovalRequestStatus.CANCELLED] },
      }
      : { workspaceId, requesterId: userId };
    return this.prisma.approvalRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: REQUEST_SUMMARY,
    });
  }

  async getRequest(workspaceId: string, requestId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, workspaceId },
      include: {
        ...REQUEST_SUMMARY,
        activities: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    const isAdmin = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    const isParticipant = request.requesterId === userId
      || request.steps.some((step) => step.approvers.some((approver) => approver.memberId === member.id));
    if (!isAdmin && !isParticipant) throw new NotFoundException('Approval request not found');
    return request;
  }

  async comment(workspaceId: string, requestId: string, userId: string, comment?: string) {
    const member = await this.membership(workspaceId, userId);
    const normalizedComment = this.requireText(comment, 'Comment');
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, workspaceId },
      select: {
        id: true,
        requesterId: true,
        steps: { select: { approvers: { select: { memberId: true } } } },
      },
    });
    if (!request) throw new NotFoundException('Approval request not found');
    const isAdmin = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    const isParticipant = request.requesterId === userId
      || request.steps.some((step) => step.approvers.some((approver) => approver.memberId === member.id));
    if (!isAdmin && !isParticipant) throw new NotFoundException('Approval request not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalActivity.create({
        data: { requestId, actorId: userId, action: 'COMMENT', comment: normalizedComment },
      });
      await tx.auditLog.create({
        data: { workspaceId, actorId: userId, action: 'APPROVAL_COMMENTED', targetType: 'ApprovalRequest', targetId: requestId },
      });
    });
    return { id: requestId, commented: true };
  }

  async decide(
    workspaceId: string,
    requestId: string,
    userId: string,
    decision: ApprovalAction,
    comment?: string,
  ) {
    const member = await this.membership(workspaceId, userId);
    const normalizedComment = this.cleanText(comment);
    if (decision !== ApprovalAction.APPROVED && !normalizedComment) {
      throw new BadRequestException('Add a comment when rejecting a request or asking for changes');
    }
    const storedDecision = APPROVAL_DECISIONS[decision];
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: requestId, workspaceId },
        include: { requester: { select: { id: true } } },
      });
      if (!request) throw new NotFoundException('Approval request not found');
      if (request.status !== ApprovalRequestStatus.IN_PROGRESS) {
        throw new ConflictException('This approval request is no longer awaiting a decision');
      }
      const step = await tx.approvalRequestStep.findFirst({
        where: { requestId, stepOrder: request.currentStepOrder, isComplete: false },
        include: { approvers: true },
      });
      if (!step) throw new ConflictException('The current approval step is unavailable');
      const assignment = step.approvers.find((approver) => approver.memberId === member.id);
      if (!assignment || assignment.decision !== ApprovalDecision.PENDING) {
        throw new ForbiddenException('You are not an active approver for this step');
      }
      const updated = await tx.approvalRequestApprover.updateMany({
        where: { id: assignment.id, decision: ApprovalDecision.PENDING },
        data: {
          decision: storedDecision,
          decidedAt: new Date(),
        },
      });
      if (!updated.count) throw new ConflictException('Your decision was already recorded');
      await tx.approvalActivity.create({
        data: { requestId, actorId: userId, action: decision, comment: normalizedComment },
      });

      let nextStatus: ApprovalRequestStatus = request.status;
      let nextStepOrder = request.currentStepOrder;
      let nextApprovers: string[] = [];
      if (decision === ApprovalAction.REJECTED) {
        nextStatus = ApprovalRequestStatus.REJECTED;
      } else if (decision === ApprovalAction.CHANGES_REQUESTED) {
        nextStatus = ApprovalRequestStatus.CHANGES_REQUESTED;
      } else {
        const remaining = await tx.approvalRequestApprover.count({
          where: { stepId: step.id, decision: ApprovalDecision.PENDING },
        });
        if (remaining === 0) {
          await tx.approvalRequestStep.update({ where: { id: step.id }, data: { isComplete: true } });
          const nextStep = await tx.approvalRequestStep.findFirst({
            where: { requestId, stepOrder: { gt: step.stepOrder } },
            orderBy: { stepOrder: 'asc' },
            include: { approvers: { include: { member: { select: { userId: true } } } } },
          });
          if (nextStep) {
            nextStepOrder = nextStep.stepOrder;
            nextApprovers = nextStep.approvers.map(({ member: approverMember }) => approverMember.userId);
          } else {
            nextStatus = ApprovalRequestStatus.APPROVED;
          }
        }
      }
      if (nextStatus !== request.status || nextStepOrder !== request.currentStepOrder) {
        await tx.approvalRequest.update({
          where: { id: requestId },
          data: { status: nextStatus, currentStepOrder: nextStepOrder },
        });
      }
      if (nextApprovers.length) {
        await this.notify(tx, workspaceId, nextApprovers, 'APPROVAL_ACTION_REQUIRED',
          `Approval required: ${request.title}`, { requestId });
      }
      if (request.requester?.id && request.requester.id !== userId
        && (nextStatus !== request.status || decision !== ApprovalAction.APPROVED)) {
        const message = nextStatus === ApprovalRequestStatus.APPROVED
          ? `Approved: ${request.title}`
          : nextStatus === ApprovalRequestStatus.REJECTED
            ? `Rejected: ${request.title}`
            : nextStatus === ApprovalRequestStatus.CHANGES_REQUESTED
              ? `Changes requested: ${request.title}`
              : `An approval was recorded: ${request.title}`;
        await this.notify(tx, workspaceId, [request.requester.id], 'APPROVAL_UPDATED', message, { requestId });
      }
      if (nextStatus === ApprovalRequestStatus.APPROVED || nextStatus === ApprovalRequestStatus.REJECTED) {
        await tx.reminder.updateMany({
          where: { approvalRequestId: requestId, cancelledAt: null },
          data: { cancelledAt: new Date(), nextDueAt: null },
        });
      }
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: `APPROVAL_${decision}`,
          targetType: 'ApprovalRequest',
          targetId: requestId,
          metadata: { comment: normalizedComment ?? null } satisfies Prisma.InputJsonValue,
        },
      });
      return { id: requestId, decision, status: nextStatus, currentStepOrder: nextStepOrder };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The approval changed while you were acting. Refresh and try again.');
      }
      throw error;
    });
  }

  async resubmit(workspaceId: string, requestId: string, userId: string, comment?: string) {
    await this.membership(workspaceId, userId);
    const normalizedComment = this.cleanText(comment);
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: requestId, workspaceId, requesterId: userId },
        include: {
          steps: {
            where: { stepOrder: 0 },
            include: { approvers: { include: { member: { select: { userId: true } } } } },
          },
        },
      });
      if (!request) throw new NotFoundException('Approval request not found');
      if (request.status !== ApprovalRequestStatus.CHANGES_REQUESTED) {
        throw new ConflictException('This request is not waiting for changes');
      }
      if (!request.steps[0]) throw new ConflictException('The request has no first approval step');
      await tx.approvalRequestApprover.updateMany({
        where: { step: { requestId } },
        data: { decision: ApprovalDecision.PENDING, decidedAt: null },
      });
      await tx.approvalRequestStep.updateMany({
        where: { requestId },
        data: { isComplete: false },
      });
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: ApprovalRequestStatus.IN_PROGRESS, currentStepOrder: 0 },
      });
      await tx.approvalActivity.create({
        data: { requestId, actorId: userId, action: 'RESUBMITTED', comment: normalizedComment },
      });
      await this.notify(tx, workspaceId, request.steps[0].approvers.map(({ member }) => member.userId),
        'APPROVAL_ACTION_REQUIRED', `Approval resubmitted: ${request.title}`, { requestId });
      await tx.auditLog.create({
        data: { workspaceId, actorId: userId, action: 'APPROVAL_RESUBMITTED', targetType: 'ApprovalRequest', targetId: requestId },
      });
      return { id: requestId, status: ApprovalRequestStatus.IN_PROGRESS };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(workspaceId: string, requestId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    const isAdmin = member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN;
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findFirst({
        where: { id: requestId, workspaceId },
        select: {
          id: true,
          requesterId: true,
          title: true,
          status: true,
          steps: {
            where: { isComplete: false },
            include: {
              approvers: {
                where: { decision: ApprovalDecision.PENDING },
                include: { member: { select: { userId: true } } },
              },
            },
          },
        },
      });
      if (!request) throw new NotFoundException('Approval request not found');
      if (!isAdmin && request.requesterId !== userId) throw new NotFoundException('Approval request not found');
      if (request.status !== ApprovalRequestStatus.IN_PROGRESS
        && request.status !== ApprovalRequestStatus.CHANGES_REQUESTED) {
        throw new ConflictException('Only open approval requests can be cancelled');
      }
      const updated = await tx.approvalRequest.updateMany({
        where: {
          id: requestId,
          workspaceId,
          status: { in: [ApprovalRequestStatus.IN_PROGRESS, ApprovalRequestStatus.CHANGES_REQUESTED] },
        },
        data: { status: ApprovalRequestStatus.CANCELLED },
      });
      if (!updated.count) throw new ConflictException('This approval request is no longer open');
      await tx.approvalActivity.create({ data: { requestId, actorId: userId, action: 'CANCELLED' } });
      await tx.reminder.updateMany({
        where: { approvalRequestId: requestId, cancelledAt: null },
        data: { cancelledAt: new Date(), nextDueAt: null },
      });
      await this.notify(tx, workspaceId,
        request.steps.flatMap((step) => step.approvers.map(({ member: approverMember }) => approverMember.userId)),
        'APPROVAL_UPDATED', `Cancelled: ${request.title}`, { requestId });
      await tx.auditLog.create({
        data: { workspaceId, actorId: userId, action: 'APPROVAL_CANCELLED', targetType: 'ApprovalRequest', targetId: requestId },
      });
      return { id: requestId, status: ApprovalRequestStatus.CANCELLED };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('The approval changed while you were acting. Refresh and try again.');
      }
      throw error;
    });
  }

  private notify(
    tx: ApprovalTransaction,
    workspaceId: string,
    userIds: string[],
    type: string,
    message: string,
    metadata: Prisma.InputJsonValue,
  ) {
    const uniqueIds = [...new Set(userIds)];
    if (!uniqueIds.length) return Promise.resolve({ count: 0 });
    return tx.notification.createMany({
      data: uniqueIds.map((userId) => ({ workspaceId, userId, type, message, metadata })),
    });
  }
}
