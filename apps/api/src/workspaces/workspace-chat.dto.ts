import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreateDirectConversationDto {
  @IsUUID()
  memberId!: string;
}

export class CreateWorkspaceChatMessageDto {
  @IsString()
  @Length(1, 4000)
  @Matches(/\S/, { message: 'Message cannot be empty' })
  content!: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;
}

export class ListWorkspaceChatMessagesDto {
  @IsOptional()
  @IsUUID()
  afterId?: string;

  @IsOptional()
  @IsUUID()
  beforeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
