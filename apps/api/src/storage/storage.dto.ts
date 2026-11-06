import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

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
