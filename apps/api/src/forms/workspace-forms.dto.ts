import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateWorkspaceFormDto {
  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsObject()
  schema!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateWorkspaceFormDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class SubmitWorkspaceFormDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  name!: string;

  @IsEmail()
  @Length(3, 320)
  email!: string;

  @IsObject()
  answers!: Record<string, unknown>;
}
