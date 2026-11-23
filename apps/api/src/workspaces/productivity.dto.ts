import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min,
} from 'class-validator';
import { WorkspaceTaskStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

abstract class AttachmentsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class CreateWorkspaceNoteDto extends AttachmentsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @IsString()
  @Length(1, 50000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body!: string;
}

export class UpdateWorkspaceNoteDto extends AttachmentsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body?: string;
}

export class CreateWorkspaceTaskDto extends AttachmentsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string;

  @IsOptional()
  @IsUUID('4')
  assigneeUserId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsEnum(WorkspaceTaskStatus)
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class UpdateWorkspaceTaskDto extends AttachmentsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string | null;

  @IsOptional()
  @IsUUID('4')
  assigneeUserId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsEnum(WorkspaceTaskStatus)
  status?: WorkspaceTaskStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
