import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { CreateFolderDto } from '../storage/storage.dto';

export class CreateWorkspaceFolderDto extends CreateFolderDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  memberIds?: string[];
}

export class RenameWorkspaceFileDto {
  @IsString()
  @Length(1, 255)
  @Matches(/\S/, { message: 'File name cannot be empty' })
  name!: string;
}

export class MoveWorkspaceFileDto {
  @IsOptional()
  @IsUUID()
  folderId?: string;
}
