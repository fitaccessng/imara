import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export enum GallerySettingDto {
  PRIVATE = 'PRIVATE',
  LINK_PUBLIC = 'LINK_PUBLIC',
  PASSCODE = 'PASSCODE',
}

export class CreateEventDto {
  @IsString()
  @Length(1, 160)
  @Matches(/\S/, { message: 'Event name cannot be empty' })
  name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsEnum(GallerySettingDto)
  gallerySetting?: GallerySettingDto;

  @IsOptional()
  @IsString()
  @Length(8, 128)
  passcode?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  @Matches(/\S/, { message: 'Event name cannot be empty' })
  name?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string | null;

  @IsOptional()
  @IsEnum(GallerySettingDto)
  gallerySetting?: GallerySettingDto;

  @IsOptional()
  @IsString()
  @Length(8, 128)
  passcode?: string;
}

export class UnlockGalleryDto {
  @IsString()
  @Length(8, 128)
  passcode!: string;
}
