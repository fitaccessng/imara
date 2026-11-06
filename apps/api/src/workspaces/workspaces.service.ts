import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FolderPermissionEffect, InvitationStatus, Prisma, WorkspaceMemberStatus, WorkspaceRole } from '@prisma/client';
import { createOpaqueToken, hashToken } from '../auth/token';
import { MailerService } from '../auth/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateFolderPermission, isWorkspaceAdministrator, PermissionRule, WORKSPACE_PERMISSION_KEYS } from './permissions';
import { CreateWorkspaceDto, InviteMemberDto, SetFolderPermissionDto, UpdateWorkspaceDto, WorkspaceMemberFolderRuleDto } from './workspaces.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function countAccessibleFolders(
  role: WorkspaceRole,
  status: WorkspaceMemberStatus,
  folders: Array<{ id: string; parentFolderId: string | null }>,
  rules: PermissionRule[],
): number {
  if (status !== WorkspaceMemberStatus.ACTIVE) return 0;
  if (isWorkspaceAdministrator(role)) return folders.length;

  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  let count = 0;
  for (const folder of folders) {
    const path: Array<{ id: string }> = [];
    const seen = new Set<string>();
    let cursor: typeof folder | undefined = folder;
    while (cursor && !seen.has(cursor.id) && path.length < 256) {
      seen.add(cursor.id);
      path.unshift({ id: cursor.id });
      cursor = cursor.parentFolderId ? foldersById.get(cursor.parentFolderId) : undefined;
    }
    if (!cursor && path.length && evaluateFolderPermission(role, 'viewFolder', path, rules)) count += 1;
  }
  return count;
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService, private readonly mailer: MailerService) {}

  private async membership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, status: WorkspaceMemberStatus.ACTIVE },
      include: { workspace: { select: {
        id: true, name: true, ownerUserId: true, createdAt: true,
        storageLimitBytes: true, storageUsedBytes: true, storageReservedBytes: true,
      } } },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    return membership;
  }

  async authorizeWorkspace(workspaceId: string, userId: string) {
    return this.membership(workspaceId, userId);
  }

  private async requireAdmin(workspaceId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    if (!isWorkspaceAdministrator(member.role)) throw new ForbiddenException('Workspace administrator access required');
    return member;
  }

  private async audit(
    workspaceId: string, actorId: string | null, action: string,
    targetType: string, targetId?: string, metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: { workspaceId, actorId, action, targetType, targetId, ...(metadata ? { metadata } : {}) },
    });
  }

  async createWorkspace(userId: string, dto: CreateWorkspaceDto) {
    const name = dto.name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!name) throw new BadRequestException('Workspace name is required');
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { name, ownerUserId: userId } });
      await tx.workspaceMember.create({
        data: { workspaceId: created.id, userId, role: WorkspaceRole.OWNER, status: WorkspaceMemberStatus.ACTIVE },
      });
      await tx.auditLog.create({
        data: { workspaceId: created.id, actorId: userId, action: 'WORKSPACE_CREATED', targetType: 'Workspace', targetId: created.id },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { id: workspace.id, name: workspace.name, role: WorkspaceRole.OWNER, createdAt: workspace.createdAt };
  }

  async listWorkspaces(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, status: WorkspaceMemberStatus.ACTIVE },
      orderBy: { joinedAt: 'asc' },
      select: { role: true, joinedAt: true, workspace: { select: { id: true, name: true, createdAt: true } } },
    });
    return memberships.map(({ workspace, role, joinedAt }) => ({ ...workspace, role, joinedAt }));
  }

  async getWorkspace(workspaceId: string, userId: string) {
    const membership = await this.membership(workspaceId, userId);
    return {
      id: membership.workspace.id, name: membership.workspace.name, role: membership.role,
      createdAt: membership.workspace.createdAt,
      ...(isWorkspaceAdministrator(membership.role) ? {
        storage: {
          limitBytes: membership.workspace.storageLimitBytes.toString(),
          usedBytes: membership.workspace.storageUsedBytes.toString(),
          reservedBytes: membership.workspace.storageReservedBytes.toString(),
        },
      } : {}),
    };
  }

  async updateWorkspace(workspaceId: string, userId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.membership(workspaceId, userId);
    if (membership.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Workspace owner access required');
    const name = dto.name?.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!name) throw new BadRequestException('Workspace name is required');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspace.update({ where: { id: workspaceId }, data: { name } });
      await tx.auditLog.create({
        data: {
          workspaceId, actorId: userId, action: 'WORKSPACE_UPDATED', targetType: 'Workspace', targetId: workspaceId,
          metadata: { name } satisfies Prisma.InputJsonValue,
        },
      });
      return { id: updated.id, name: updated.name, updatedAt: updated.updatedAt };
    });
  }

  async listMembers(workspaceId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: { not: WorkspaceMemberStatus.REMOVED } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true, role: true, status: true, joinedAt: true, updatedAt: true, displayName: true,
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { permissions: true } },
        permissions: { select: { folderId: true, effect: true, permissionKeys: true, inherit: true } },
      },
    });
    const folders = await this.prisma.folder.findMany({
      where: { workspaceId },
      select: { id: true, parentFolderId: true },
    });
    return members.map(({ permissions, ...member }) => {
      const rules: PermissionRule[] = permissions.map((rule) => ({
        folderId: rule.folderId,
        effect: rule.effect,
        permissionKeys: rule.permissionKeys,
        inherit: rule.inherit,
      }));
      return { ...member, accessibleFolderCount: countAccessibleFolders(member.role, member.status, folders, rules) };
    });
  }

  async getMember(workspaceId: string, memberId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, id: memberId, status: { not: WorkspaceMemberStatus.REMOVED } },
      select: {
        id: true, role: true, status: true, joinedAt: true, updatedAt: true, displayName: true,
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { permissions: true } },
        permissions: { select: { id: true, folderId: true, effect: true, permissionKeys: true, inherit: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!member) throw new NotFoundException('Workspace member not found');
    const folders = await this.prisma.folder.findMany({
      where: { workspaceId },
      select: { id: true, parentFolderId: true },
    });
    const rules: PermissionRule[] = member.permissions.map((rule) => ({
      folderId: rule.folderId,
      effect: rule.effect,
      permissionKeys: rule.permissionKeys,
      inherit: rule.inherit,
    }));
    return { ...member, accessibleFolderCount: countAccessibleFolders(member.role, member.status, folders, rules) };
  }

  async listInvitations(workspaceId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    await this.prisma.workspaceInvitation.updateMany({
      where: { workspaceId, status: InvitationStatus.PENDING, expiresAt: { lte: new Date() } },
      data: { status: InvitationStatus.EXPIRED },
    });
    return this.prisma.workspaceInvitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, status: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true },
    });
  }

  async invite(workspaceId: string, actorId: string, dto: InviteMemberDto) {
    const actor = await this.requireAdmin(workspaceId, actorId);
    if (!this.mailer.isConfigured()) throw new ServiceUnavailableException('Invitation email delivery is not configured.');
    if (dto.role === WorkspaceRole.OWNER) throw new BadRequestException('Owner role cannot be assigned by invitation');
    if (actor.role !== WorkspaceRole.OWNER && dto.role === WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only the owner can invite administrators');
    }
    if (dto.initialPermissions?.length && dto.role === WorkspaceRole.ADMIN) {
      throw new BadRequestException('Initial folder permissions are only supported for managers and staff');
    }
    const initialFolders = new Set<string>();
    for (const grant of dto.initialPermissions ?? []) {
      if (initialFolders.has(grant.folderId)) throw new BadRequestException('Only one initial permission rule per folder is supported');
      initialFolders.add(grant.folderId);
      if (grant.permissionKeys.some((key) => !/^[A-Za-z][A-Za-z0-9:_-]{0,79}$/.test(key))) {
        throw new BadRequestException('Invalid initial folder permission key');
      }
      const folder = await this.prisma.folder.findFirst({
        where: { id: grant.folderId, workspaceId }, select: { id: true },
      });
      if (!folder) throw new NotFoundException('Initial access folder not found');
    }
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: existing.id } } });
      if (member && member.status !== WorkspaceMemberStatus.REMOVED) throw new ConflictException('This user is already a workspace member');
    }
    const current = await this.prisma.workspaceInvitation.findUnique({ where: { workspaceId_email: { workspaceId, email } } });
    if (current?.status === InvitationStatus.PENDING && current.expiresAt > new Date()) {
      throw new ConflictException('An active invitation already exists for this email address');
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await this.prisma.workspaceInvitation.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: {
        workspaceId, email, name: dto.name?.trim() || null, role: dto.role,
        tokenHash: hashToken(token), invitedById: actorId, expiresAt, status: InvitationStatus.PENDING,
        initialPermissions: dto.initialPermissions ? dto.initialPermissions as unknown as Prisma.InputJsonValue : Prisma.DbNull,
      },
      update: {
        name: dto.name?.trim() || null, role: dto.role, tokenHash: hashToken(token),
        invitedById: actorId, expiresAt, status: InvitationStatus.PENDING, acceptedAt: null, revokedAt: null,
        initialPermissions: dto.initialPermissions ? dto.initialPermissions as unknown as Prisma.InputJsonValue : Prisma.DbNull,
      },
      select: { id: true },
    });
    try {
      await this.mailer.sendWorkspaceInvitation(email, token, actor.workspace.name);
    } catch (error) {
      await this.prisma.workspaceInvitation.updateMany({
        where: { id: invitation.id, tokenHash: hashToken(token), status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
      });
      throw error;
    }
    await this.audit(workspaceId, actorId, 'INVITATION_CREATED', 'WorkspaceInvitation', invitation.id, { email, role: dto.role });
    return { id: invitation.id, email, role: dto.role, status: InvitationStatus.PENDING, expiresAt };
  }

  async resendInvitation(workspaceId: string, invitationId: string, actorId: string) {
    const actor = await this.requireAdmin(workspaceId, actorId);
    if (!this.mailer.isConfigured()) throw new ServiceUnavailableException('Invitation email delivery is not configured.');
    const current = await this.prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId } });
    if (!current || current.status === InvitationStatus.ACCEPTED || current.status === InvitationStatus.REVOKED) {
      throw new NotFoundException('Pending invitation not found');
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const updated = await this.prisma.workspaceInvitation.update({
      where: { id: current.id },
      data: { tokenHash: hashToken(token), expiresAt, status: InvitationStatus.PENDING, revokedAt: null, invitedById: actorId },
    });
    try {
      await this.mailer.sendWorkspaceInvitation(updated.email, token, actor.workspace.name);
    } catch (error) {
      await this.prisma.workspaceInvitation.updateMany({
        where: { id: updated.id, tokenHash: hashToken(token) },
        data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
      });
      throw error;
    }
    await this.audit(workspaceId, actorId, 'INVITATION_RESENT', 'WorkspaceInvitation', updated.id);
    return { id: updated.id, email: updated.email, role: updated.role, status: updated.status, expiresAt };
  }

  async revokeInvitation(workspaceId: string, invitationId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    const result = await this.prisma.workspaceInvitation.updateMany({
      where: { id: invitationId, workspaceId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Pending invitation not found');
    await this.audit(workspaceId, actorId, 'INVITATION_REVOKED', 'WorkspaceInvitation', invitationId);
  }

  async acceptInvitation(userId: string, token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new NotFoundException('Invitation not found');
    const tokenHash = hashToken(token);
    const preflight = await this.prisma.workspaceInvitation.findUnique({ where: { tokenHash } });
    if (preflight?.status === InvitationStatus.PENDING && preflight.expiresAt <= new Date()) {
      await this.prisma.workspaceInvitation.updateMany({
        where: { id: preflight.id, status: InvitationStatus.PENDING, tokenHash },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ConflictException('Invitation has expired');
    }
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.workspaceInvitation.findUnique({ where: { tokenHash } });
      if (!invitation || invitation.status !== InvitationStatus.PENDING) throw new NotFoundException('Invitation not found');
      if (invitation.expiresAt <= new Date()) {
        await tx.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: InvitationStatus.EXPIRED } });
        throw new ConflictException('Invitation has expired');
      }
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new ForbiddenException('Sign in with the email address that received this invitation');
      }
      if (invitation.role === WorkspaceRole.OWNER) throw new ConflictException('Invalid invitation role');
      const existing = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      });
      if (existing && existing.status !== WorkspaceMemberStatus.REMOVED) throw new ConflictException('Already a workspace member');
      const member = existing
        ? await tx.workspaceMember.update({
          where: { id: existing.id },
          data: {
            role: invitation.role, status: WorkspaceMemberStatus.ACTIVE, joinedAt: new Date(),
            ...(invitation.name ? { displayName: invitation.name } : {}),
          },
        })
        : await tx.workspaceMember.create({
          data: {
            workspaceId: invitation.workspaceId, userId, role: invitation.role,
            status: WorkspaceMemberStatus.ACTIVE, displayName: invitation.name,
          },
        });
      const initialPermissions = Array.isArray(invitation.initialPermissions)
        ? invitation.initialPermissions as Array<{ folderId: string; permissionKeys: string[]; inherit: boolean }>
        : [];
      for (const grant of initialPermissions) {
        if (!grant || typeof grant.folderId !== 'string' || !Array.isArray(grant.permissionKeys)
          || typeof grant.inherit !== 'boolean') continue;
        const folder = await tx.folder.findFirst({
          where: { id: grant.folderId, workspaceId: invitation.workspaceId }, select: { id: true },
        });
        if (!folder) continue;
        await tx.folderPermission.create({
          data: {
            workspaceId: invitation.workspaceId, folderId: folder.id, memberId: member.id, effect: FolderPermissionEffect.GRANT,
            permissionKeys: grant.permissionKeys.filter((key) => typeof key === 'string').slice(0, 50),
            inherit: grant.inherit, createdById: invitation.invitedById, updatedById: invitation.invitedById,
          },
        });
      }
      const consumed = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING, tokenHash },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
      if (!consumed.count) throw new ConflictException('Invitation was already used');
      await tx.auditLog.create({
        data: { workspaceId: invitation.workspaceId, actorId: userId, action: 'INVITATION_ACCEPTED', targetType: 'WorkspaceMember', targetId: member.id },
      });
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: invitation.workspaceId }, select: { ownerUserId: true, name: true } });
      await tx.notification.create({
        data: {
          workspaceId: invitation.workspaceId, userId: workspace.ownerUserId, type: 'INVITATION_ACCEPTED',
          message: `${invitation.email} accepted a workspace invitation`,
          metadata: { memberId: member.id } satisfies Prisma.InputJsonValue,
        },
      });
      await tx.notification.create({
        data: {
          workspaceId: invitation.workspaceId, userId, type: 'INVITATION_ACCEPTED',
          message: `You joined ${workspace.name}`,
          metadata: { memberId: member.id } satisfies Prisma.InputJsonValue,
        },
      });
      return { workspaceId: invitation.workspaceId, memberId: member.id, role: member.role };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateMember(workspaceId: string, memberId: string, actorId: string, role?: WorkspaceRole, displayName?: string) {
    const actor = await this.requireAdmin(workspaceId, actorId);
    const target = await this.prisma.workspaceMember.findFirst({ where: { workspaceId, id: memberId, status: { not: WorkspaceMemberStatus.REMOVED } } });
    if (!target) throw new NotFoundException('Workspace member not found');
    if (target.role === WorkspaceRole.OWNER) throw new ForbiddenException('The owner role cannot be changed');
    if (actor.role !== WorkspaceRole.OWNER && (target.role === WorkspaceRole.ADMIN || role === WorkspaceRole.ADMIN || role === WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only the owner can manage administrator roles');
    }
    if (role === WorkspaceRole.OWNER) throw new BadRequestException('Ownership transfer is not supported');
    if (!role && displayName === undefined) return this.getMember(workspaceId, memberId, actorId);
    const updated = await this.prisma.workspaceMember.update({
      where: { id: target.id },
      data: { ...(role ? { role } : {}), ...(displayName !== undefined ? { displayName: displayName.trim() } : {}) },
    });
    if (role) {
      await this.audit(workspaceId, actorId, 'MEMBER_ROLE_CHANGED', 'WorkspaceMember', memberId, { from: target.role, to: role });
      await this.notifyMember(workspaceId, target.userId, 'ROLE_CHANGED', 'Your workspace role was changed');
      await this.notifyWorkspaceOwner(workspaceId, 'MEMBER_ROLE_CHANGED', 'A workspace member role changed', { memberId, role });
    }
    if (displayName !== undefined) {
      await this.audit(workspaceId, actorId, 'MEMBER_PROFILE_UPDATED', 'WorkspaceMember', memberId, { displayName: updated.displayName });
      await this.notifyWorkspaceOwner(workspaceId, 'MEMBER_PROFILE_UPDATED', 'A workspace member profile was updated', { memberId });
    }
    return { id: updated.id, role: updated.role, status: updated.status, displayName: updated.displayName };
  }

  async suspendMember(workspaceId: string, memberId: string, actorId: string, status: WorkspaceMemberStatus) {
    const actor = await this.requireAdmin(workspaceId, actorId);
    const target = await this.prisma.workspaceMember.findFirst({ where: { workspaceId, id: memberId, status: { not: WorkspaceMemberStatus.REMOVED } } });
    if (!target) throw new NotFoundException('Workspace member not found');
    if (target.role === WorkspaceRole.OWNER || target.userId === actorId) throw new ForbiddenException('Cannot suspend the workspace owner or yourself');
    if (actor.role !== WorkspaceRole.OWNER && target.role === WorkspaceRole.ADMIN) throw new ForbiddenException('Only the owner can manage administrators');
    const updated = await this.prisma.workspaceMember.update({ where: { id: target.id }, data: { status } });
    const action = status === WorkspaceMemberStatus.SUSPENDED ? 'MEMBER_SUSPENDED' : 'MEMBER_RESTORED';
    await this.audit(workspaceId, actorId, action, 'WorkspaceMember', memberId);
    await this.notifyMember(workspaceId, target.userId, status === WorkspaceMemberStatus.SUSPENDED ? 'ACCESS_SUSPENDED' : 'ACCESS_RESTORED',
      status === WorkspaceMemberStatus.SUSPENDED ? 'Your workspace access was suspended' : 'Your workspace access was restored');
    await this.notifyWorkspaceOwner(workspaceId, action, status === WorkspaceMemberStatus.SUSPENDED ? 'A workspace member was suspended' : 'A workspace member was restored', { memberId });
    return { id: updated.id, status: updated.status };
  }

  async removeMember(workspaceId: string, memberId: string, actorId: string) {
    const actor = await this.requireAdmin(workspaceId, actorId);
    const target = await this.prisma.workspaceMember.findFirst({ where: { workspaceId, id: memberId, status: { not: WorkspaceMemberStatus.REMOVED } } });
    if (!target) throw new NotFoundException('Workspace member not found');
    if (target.role === WorkspaceRole.OWNER || target.userId === actorId) throw new ForbiddenException('Cannot remove the workspace owner or yourself');
    if (actor.role !== WorkspaceRole.OWNER && target.role === WorkspaceRole.ADMIN) throw new ForbiddenException('Only the owner can manage administrators');
    await this.prisma.$transaction(async (tx) => {
      await tx.folderPermission.deleteMany({ where: { workspaceId, memberId } });
      await tx.workspaceMember.update({ where: { id: memberId }, data: { status: WorkspaceMemberStatus.REMOVED } });
      await tx.auditLog.create({ data: { workspaceId, actorId, action: 'MEMBER_REMOVED', targetType: 'WorkspaceMember', targetId: memberId } });
    });
    await this.notifyMember(workspaceId, target.userId, 'MEMBER_REMOVED', 'You were removed from a workspace');
    await this.notifyWorkspaceOwner(workspaceId, 'MEMBER_REMOVED', 'A workspace member was removed', { memberId });
  }

  private async notifyMember(workspaceId: string, userId: string, type: string, message: string) {
    await this.prisma.notification.create({ data: { workspaceId, userId, type, message } });
  }

  private async notifyWorkspaceOwner(workspaceId: string, type: string, message: string, metadata?: Prisma.InputJsonValue) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerUserId: true } });
    if (!workspace) return;
    await this.prisma.notification.create({
      data: { workspaceId, userId: workspace.ownerUserId, type, message, ...(metadata ? { metadata } : {}) },
    });
  }

  private async folderPath(workspaceId: string, folderId: string) {
    const path: Array<{ id: string; parentFolderId: string | null; workspaceId: string | null }> = [];
    let cursor: string | null = folderId;
    const seen = new Set<string>();
    while (cursor && path.length < 256) {
      if (seen.has(cursor)) throw new NotFoundException('Folder not found');
      seen.add(cursor);
      const folder: { id: string; parentFolderId: string | null; workspaceId: string | null } | null =
        await this.prisma.folder.findFirst({
          where: { id: cursor, workspaceId },
          select: { id: true, parentFolderId: true, workspaceId: true },
        });
      if (!folder) throw new NotFoundException('Folder not found');
      path.unshift(folder);
      cursor = folder.parentFolderId;
    }
    if (cursor) throw new NotFoundException('Folder not found');
    return path;
  }

  async authorizeFolder(workspaceId: string, userId: string, folderId: string, permission: string) {
    const member = await this.membership(workspaceId, userId);
    const path = await this.folderPath(workspaceId, folderId);
    if (isWorkspaceAdministrator(member.role)) return { member, path };
    const permissions = await this.prisma.folderPermission.findMany({
      where: { workspaceId, memberId: member.id, folderId: { in: path.map((folder) => folder.id) } },
      select: { folderId: true, effect: true, permissionKeys: true, inherit: true },
    });
    const rules: PermissionRule[] = permissions.map((rule) => ({
      folderId: rule.folderId, effect: rule.effect, permissionKeys: rule.permissionKeys, inherit: rule.inherit,
    }));
    if (!evaluateFolderPermission(member.role, permission, path, rules)) throw new NotFoundException('Folder not found');
    return { member, path };
  }

  async accessibleFolders(workspaceId: string, userId: string) {
    const member = await this.membership(workspaceId, userId);
    const folders = await this.prisma.folder.findMany({
      where: { workspaceId }, orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, parentFolderId: true, createdAt: true },
    });
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const rules = isWorkspaceAdministrator(member.role) ? [] : await this.prisma.folderPermission.findMany({
      where: { workspaceId, memberId: member.id },
      select: { folderId: true, effect: true, permissionKeys: true, inherit: true },
    });
    const resolved = new Map<string, { folder: typeof folders[number]; permissions: string[]; path: Array<{ id: string }> }>();
    for (const folder of folders) {
      const path: Array<{ id: string }> = [];
      const seen = new Set<string>();
      let cursor: typeof folder | undefined = folder;
      while (cursor && !seen.has(cursor.id) && path.length < 256) {
        seen.add(cursor.id);
        path.unshift({ id: cursor.id });
        cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
      }
      if (cursor || !path.length) continue;
      const permissions = WORKSPACE_PERMISSION_KEYS.filter((key) =>
        evaluateFolderPermission(member.role, key, path, rules as PermissionRule[]));
      if (permissions.includes('viewFolder')) resolved.set(folder.id, { folder, permissions, path });
    }
    return [...resolved.values()].map(({ folder, permissions, path }) => ({
      ...folder,
      // Do not expose an inaccessible parent as a breadcrumb or tree node.
      parentFolderId: folder.parentFolderId && resolved.has(folder.parentFolderId) ? folder.parentFolderId : null,
      permissions,
      inherited: WORKSPACE_PERMISSION_KEYS.some((key) =>
        evaluateFolderPermission(member.role, key, path, rules.filter((rule) => rule.folderId !== folder.id))),
    }));
  }

  async getMemberPermissions(workspaceId: string, memberId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
    if (!member) throw new NotFoundException('Workspace member not found');
    const permissions = await this.prisma.folderPermission.findMany({
      where: { workspaceId, memberId }, orderBy: { createdAt: 'asc' },
      include: { folder: { select: { id: true, name: true, parentFolderId: true } } },
    });
    return { memberId, role: member.role, permissions };
  }

  async replaceMemberPermissions(workspaceId: string, memberId: string, actorId: string, rules: WorkspaceMemberFolderRuleDto[]) {
    await this.requireAdmin(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId, status: WorkspaceMemberStatus.ACTIVE } });
    if (!member || member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN) {
      throw new NotFoundException('Eligible workspace member not found');
    }
    const uniqueRules = new Set<string>();
    for (const rule of rules) {
      if (!Array.isArray(rule.permissionKeys) || rule.permissionKeys.some((key) => !/^[A-Za-z][A-Za-z0-9:_-]{0,79}$/.test(key))) {
        throw new BadRequestException('Permission keys must be valid identifiers');
      }
      const key = `${rule.folderId}:${rule.effect}`;
      if (uniqueRules.has(key)) throw new BadRequestException('Duplicate permission rule');
      uniqueRules.add(key);
    }
    // Replace API payload uses folderId and is transactionally replaced as one set.
    await this.prisma.$transaction(async (tx) => {
      for (const rule of rules) {
        const folder = await tx.folder.findFirst({ where: { id: rule.folderId, workspaceId }, select: { id: true } });
        if (!folder) throw new NotFoundException('Folder not found');
      }
      await tx.folderPermission.deleteMany({ where: { workspaceId, memberId } });
      for (const rule of rules) {
        const folderId = rule.folderId;
        await tx.folderPermission.create({
          data: {
            workspaceId, memberId, folderId, effect: rule.effect, inherit: rule.inherit,
            permissionKeys: [...new Set(rule.permissionKeys)], createdById: actorId, updatedById: actorId,
          },
        });
      }
      await tx.auditLog.create({
        data: { workspaceId, actorId, action: 'FOLDER_PERMISSIONS_REPLACED', targetType: 'WorkspaceMember', targetId: memberId },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.notifyMember(workspaceId, member.userId, 'FOLDER_ACCESS_CHANGED', 'Your workspace folder permissions were updated');
    await this.notifyWorkspaceOwner(workspaceId, 'FOLDER_PERMISSION_CHANGED', 'A member folder permission set changed', { memberId });
    return this.getMemberPermissions(workspaceId, memberId, actorId);
  }

  async folderPermissions(workspaceId: string, folderId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    await this.folderPath(workspaceId, folderId);
    return this.prisma.folderPermission.findMany({
      where: { workspaceId, folderId },
      include: { member: { select: { id: true, role: true, user: { select: { id: true, email: true, name: true } } } } },
    });
  }

  async setFolderPermission(workspaceId: string, folderId: string, actorId: string, dto: SetFolderPermissionDto & { memberId: string }) {
    await this.requireAdmin(workspaceId, actorId);
    await this.folderPath(workspaceId, folderId);
    const member = await this.prisma.workspaceMember.findFirst({ where: { id: dto.memberId, workspaceId, status: WorkspaceMemberStatus.ACTIVE } });
    if (!member || member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN) throw new NotFoundException('Eligible workspace member not found');
    if (dto.permissionKeys.some((key) => !/^[A-Za-z][A-Za-z0-9:_-]{0,79}$/.test(key))) throw new BadRequestException('Invalid permission key');
    const result = await this.prisma.$transaction(async (tx) => {
      const permission = await tx.folderPermission.upsert({
        where: { workspaceId_folderId_memberId_effect: { workspaceId, folderId, memberId: member.id, effect: dto.effect } },
        create: {
          workspaceId, folderId, memberId: member.id, effect: dto.effect, inherit: dto.inherit,
          permissionKeys: [...new Set(dto.permissionKeys)], createdById: actorId, updatedById: actorId,
        },
        update: { inherit: dto.inherit, permissionKeys: [...new Set(dto.permissionKeys)], updatedById: actorId },
      });
      await tx.auditLog.create({
        data: {
          workspaceId, actorId,
          action: dto.effect === FolderPermissionEffect.RESTRICT ? 'FOLDER_ACCESS_RESTRICTED' : 'FOLDER_PERMISSION_CHANGED',
          targetType: 'FolderPermission', targetId: permission.id,
          metadata: { folderId, memberId: member.id, permissionKeys: permission.permissionKeys, inherit: permission.inherit, effect: permission.effect } satisfies Prisma.InputJsonValue,
        },
      });
      return permission;
    });
    await this.notifyMember(workspaceId, member.userId, dto.effect === FolderPermissionEffect.RESTRICT ? 'FOLDER_ACCESS_REVOKED' : 'FOLDER_ACCESS_GRANTED',
      dto.effect === FolderPermissionEffect.RESTRICT ? 'Folder access was restricted' : 'Folder access was updated');
    await this.notifyWorkspaceOwner(workspaceId, 'FOLDER_PERMISSION_CHANGED', 'A member folder permission changed', { folderId, memberId: member.id });
    return result;
  }

  async activity(workspaceId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    return this.prisma.auditLog.findMany({
      where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeFolderPermission(workspaceId: string, folderId: string, permissionId: string, actorId: string) {
    await this.requireAdmin(workspaceId, actorId);
    const permission = await this.prisma.folderPermission.findFirst({ where: { id: permissionId, workspaceId, folderId } });
    if (!permission) throw new NotFoundException('Folder permission not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.folderPermission.delete({ where: { id: permission.id } });
      await tx.auditLog.create({
        data: {
          workspaceId, actorId, action: 'FOLDER_PERMISSION_REMOVED', targetType: 'FolderPermission', targetId: permission.id,
          metadata: { folderId, memberId: permission.memberId } satisfies Prisma.InputJsonValue,
        },
      });
    });
  }

  async previewFolderPermission(workspaceId: string, folderId: string, actorId: string, memberId: string, permissionKeys: string[], inherit: boolean) {
    await this.requireAdmin(workspaceId, actorId);
    const member = await this.prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
    if (!member) throw new NotFoundException('Workspace member not found');
    const path = await this.folderPath(workspaceId, folderId);
    const rules = await this.prisma.folderPermission.findMany({
      where: { workspaceId, memberId, folderId: { in: path.map((folder) => folder.id) } },
      select: { folderId: true, effect: true, permissionKeys: true, inherit: true },
    });
    const candidate: PermissionRule = { folderId, effect: 'GRANT', permissionKeys, inherit };
    const all = [...rules, candidate] as PermissionRule[];
    return {
      folderId, memberId,
      permissions: Object.fromEntries(permissionKeys.map((key) => [key, evaluateFolderPermission(member.role, key, path, all)])),
    };
  }

  async notifications(workspaceId: string, userId: string) {
    await this.membership(workspaceId, userId);
    return this.prisma.notification.findMany({ where: { workspaceId, userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markNotificationRead(workspaceId: string, notificationId: string, userId: string) {
    await this.membership(workspaceId, userId);
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, workspaceId, userId, readAt: null }, data: { readAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.prisma.notification.findFirst({ where: { id: notificationId, workspaceId, userId } });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { id: notificationId, read: true };
  }
}
