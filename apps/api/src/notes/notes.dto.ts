import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateNoteDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(20000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body!: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'Title cannot be empty' })
  title?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20000)
  @Matches(/\S/, { message: 'Body cannot be empty' })
  body?: string;
}

export class ListNotesQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  search?: string;
}
