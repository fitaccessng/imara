import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class SendWorkspaceFileDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  recipientUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  emailRecipients?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Matches(/\S/, { message: 'Message cannot be empty' })
  message?: string;
}
