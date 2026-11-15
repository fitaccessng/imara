import { PersonalDocumentType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreatePersonalDocumentDto {
  @IsEnum(PersonalDocumentType)
  type!: PersonalDocumentType;

  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsObject()
  content!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdatePersonalDocumentDto {
  @IsOptional()
  @IsEnum(PersonalDocumentType)
  type?: PersonalDocumentType;

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
  content?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class SubmitPersonalFormDto {
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

export class SignPersonalAgreementDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  name!: string;

  @IsEmail()
  @Length(3, 320)
  email!: string;

  @IsBoolean()
  consent!: boolean;
}
