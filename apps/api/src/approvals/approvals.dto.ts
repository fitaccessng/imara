import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalReviewMode } from '@prisma/client';

export class ApprovalTemplateStepDto {
  @IsEnum(ApprovalReviewMode)
  mode!: ApprovalReviewMode;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  approverMemberIds!: string[];
}

export class CreateApprovalTemplateDto {
  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalTemplateStepDto)
  steps!: ApprovalTemplateStepDto[];
}

export class UpdateApprovalTemplateDto {
  @IsBoolean()
  isActive!: boolean;
}

export class CreateApprovalRequestDto {
  @IsUUID('4')
  templateId!: string;

  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export enum ApprovalAction {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
}

export class ApprovalDecisionDto {
  @IsEnum(ApprovalAction)
  decision!: ApprovalAction;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}

export class ApprovalCommentDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  comment?: string;
}
