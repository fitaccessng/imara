import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { FileCategory } from '@prisma/client';

export class SearchFilesDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Search query cannot be empty' })
  q!: string;
}

export class CreateFolderDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Folder name cannot be empty' })
  name!: string;

  @IsOptional()
  @IsUUID()
  parentFolderId?: string;
}

export class RenameFolderDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Folder name cannot be empty' })
  name!: string;
}

export class MoveFolderDto {
  @IsOptional()
  @IsUUID()
  parentFolderId?: string | null;
}

export class UploadFileDto {
  @IsOptional()
  @IsUUID()
  folderId?: string;
}

export class ReplaceFileContentDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 200)
  changeSummary?: string;
}

export class UpdateFavoriteDto {
  @IsBoolean()
  isFavorite!: boolean;
}

export class UpdateFileOrganizationDto {
  @IsOptional()
  @IsEnum(FileCategory)
  category?: FileCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class UpdateFileExpiryDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresAt must be an ISO date (YYYY-MM-DD) or null' })
  expiresAt!: string | null;
}

export class SetOcrTextDto {
  @IsString()
  @MaxLength(100_000)
  text!: string;
}
