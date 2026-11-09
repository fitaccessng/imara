import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ApprovalReviewMode, SignatureMethod } from '@prisma/client';

export class CreateSignatureRequestDto {
  @IsUUID('4')
  sourceFileId!: string;

  @IsEnum(ApprovalReviewMode)
  mode!: ApprovalReviewMode;

  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  signerMemberIds!: string[];

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class SignSignatureRequestDto {
  @IsBoolean()
  consent!: boolean;

  @IsEnum(SignatureMethod)
  method!: SignatureMethod;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  signedName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1_400_000)
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
  signaturePng?: string;
}

export class DeclineSignatureRequestDto {
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  declineReason?: string;
}
