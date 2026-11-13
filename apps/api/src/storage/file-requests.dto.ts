import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, Matches, MaxLength, IsOptional } from 'class-validator';

export class CreateFileRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsUUID()
  destinationFolderId?: string;
}

export class FileRequestUploadDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  relativePath?: string;
}
