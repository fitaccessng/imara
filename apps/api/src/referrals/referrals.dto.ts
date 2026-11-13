import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateReferralProgramDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\{code\}/, { message: 'Referral link template must contain {code}' })
  linkTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  copyInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
