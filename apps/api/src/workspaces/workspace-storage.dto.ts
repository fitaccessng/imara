import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

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
