import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateReminderDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  dueAt!: string;

  @IsIn(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'])
  recurrence!: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'])
  recurrence?: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}
