import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min,
} from 'class-validator';
import { PersonalTaskStatus } from '@prisma/client';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateNoteDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(20000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class UpdateNoteDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class CreatePersonalTaskDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @IsOptional()
  @IsEnum(PersonalTaskStatus)
  status?: PersonalTaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class UpdatePersonalTaskDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @IsOptional()
  @IsEnum(PersonalTaskStatus)
  status?: PersonalTaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class ListNotesQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  search?: string;
}
