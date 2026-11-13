import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID,
  Length, Matches,
} from 'class-validator';

export const CALENDAR_REMINDER_OPTIONS = [0, 5, 15, 30, 60, 1440] as const;

abstract class CalendarReminderFields {
  @IsOptional()
  @IsIn(CALENDAR_REMINDER_OPTIONS)
  reminderMinutesBefore?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  taggedUserIds?: string[];
}

export class CreateCalendarEventDto extends CalendarReminderFields {
  @IsString()
  @Length(1, 200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsBoolean()
  allDay!: boolean;
}

export class UpdateCalendarEventDto extends CalendarReminderFields {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;
}
