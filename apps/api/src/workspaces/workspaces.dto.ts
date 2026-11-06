import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FolderPermissionEffect, WorkspaceRole } from '@prisma/client';

export class CreateWorkspaceDto {
  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  name!: string;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  @Matches(/\S/, { message: 'Workspace name cannot be empty' })
  name?: string;
}

export class InitialFolderPermissionDto {
  @IsUUID()
  folderId!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissionKeys!: string[];

  @IsBoolean()
  inherit!: boolean;
}

export class InviteMemberDto {
  @IsEmail()
  @Length(3, 320)
  email!: string;
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InitialFolderPermissionDto)
  initialPermissions?: InitialFolderPermissionDto[];
}

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Name cannot be empty' })
  name?: string;
}

export class WorkspaceMemberFolderRuleDto {
  @IsUUID()
  folderId!: string;
  @IsEnum(FolderPermissionEffect)
  effect!: FolderPermissionEffect;
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissionKeys!: string[];
  @IsBoolean()
  inherit!: boolean;
}

export class SetFolderPermissionDto {
  @IsUUID()
  memberId!: string;

  @IsEnum(FolderPermissionEffect)
  effect!: FolderPermissionEffect;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissionKeys!: string[];

  @IsBoolean()
  inherit!: boolean;
}

export class PermissionPreviewDto {
  @IsUUID()
  memberId!: string;
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  permissionKeys!: string[];
  @IsBoolean()
  inherit!: boolean;
}

export class ReplaceMemberPermissionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceMemberFolderRuleDto)
  permissions!: WorkspaceMemberFolderRuleDto[];
}
