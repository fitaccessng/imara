import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class MeetingActionItemDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsUUID('4')
  assigneeUserId?: string | null;
}

export class CreateMeetingDto {
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @IsString()
  @Length(0, 100000)
  transcript!: string;

  @IsOptional()
  @IsString()
  @Length(0, 20000)
  summary?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  decisions?: string[];

  @IsOptional()
  @IsUUID('4')
  recordingFileId?: string | null;

  @IsOptional()
  @IsUUID('4')
  calendarEventId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MeetingActionItemDto)
  actionItems?: MeetingActionItemDto[];
}

export class UpdateMeetingDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string | null;

  @IsOptional()
  @IsDateString()
  endedAt?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100000)
  transcript?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20000)
  summary?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  decisions?: string[];

  @IsOptional()
  @IsUUID('4')
  recordingFileId?: string | null;

  @IsOptional()
  @IsUUID('4')
  calendarEventId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MeetingActionItemDto)
  actionItems?: MeetingActionItemDto[];
}
