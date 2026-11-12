import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayUnique,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EventGallerySetting,
  EventStatus,
  PaymentAttemptStatus,
  Plan,
  PlatformAnnouncementAudience,
  PlatformAnnouncementTarget,
  PlatformAdminRole,
  PlatformAdminStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  UserAccountStatus,
} from '@prisma/client';

export class AdminPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminAnnouncementsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (
    value === 'true' ? true : value === 'false' ? false : value
  ))
  @IsBoolean()
  archived = false;
}

export class AdminSubscriptionsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;
}

export class AdminPaymentsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsEnum(PaymentAttemptStatus)
  status?: PaymentAttemptStatus;

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @IsOptional()
  @IsDateString()
  @MaxLength(40)
  from?: string;

  @IsOptional()
  @IsDateString()
  @MaxLength(40)
  to?: string;
}

export class AdminPlatformAdminUpdateDto {
  @IsEnum(PlatformAdminRole)
  role!: PlatformAdminRole;

  @IsEnum(PlatformAdminStatus)
  status!: PlatformAdminStatus;
}

export class AdminAuditQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  resourceType?: string;
}

export class AdminUserStatusDto {
  @IsEnum(UserAccountStatus)
  status!: UserAccountStatus;
}

export class AdminEventsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsEnum(EventGallerySetting)
  gallerySetting?: EventGallerySetting;
}

export class AdminAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  @MaxLength(40)
  from?: string;

  @IsOptional()
  @IsDateString()
  @MaxLength(40)
  to?: string;
}

export class AdminPlanCatalogueUpdateDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  staffLimit!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  activeEventLimit!: number;

  @IsString()
  @MaxLength(19)
  @Matches(/^(0|[1-9]\d*)$/)
  storageLimitBytes!: string;

  @IsBoolean()
  canEditDocuments!: boolean;

  @IsBoolean()
  canScanDocuments!: boolean;

  @IsBoolean()
  advancedTeamManagement!: boolean;

  @IsString()
  @MaxLength(19)
  @Matches(/^(0|[1-9]\d*)$/)
  monthlyPriceMinor!: string;
}

export class AdminAnnouncementCreateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsEnum(PlatformAnnouncementAudience)
  audience!: PlatformAnnouncementAudience;

  @IsEnum(PlatformAnnouncementTarget)
  target: PlatformAnnouncementTarget = PlatformAnnouncementTarget.AUDIENCE;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsIn([30, 60, 1440, 10080, 43200])
  signupWindowMinutes?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsBoolean()
  emailEnabled!: boolean;
}

export class AdminAnnouncementRecipientsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsEnum(PlatformAnnouncementAudience)
  audience?: PlatformAnnouncementAudience;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @IsIn([30, 60, 1440, 10080, 43200])
  createdWithinMinutes?: number;
}

export class SupportTicketCreateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class SupportTicketMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  internalNote = false;
}

export class SupportTicketReplyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class AdminSupportTicketsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;
}

export class AdminSupportTicketUpdateDto {
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;

  @IsEnum(SupportTicketPriority)
  priority!: SupportTicketPriority;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string | null;
}
