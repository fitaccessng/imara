import { IsBoolean, IsDateString, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCalendarEventDto {
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

export class UpdateCalendarEventDto {
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
