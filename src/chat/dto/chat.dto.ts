import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChatDto {
  @ApiPropertyOptional({ description: 'Thread ID from LangGraph' })
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiPropertyOptional({ description: 'Conversation title' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'First message content' })
  @IsOptional()
  @IsString()
  initialMessage?: string;
}

export class UpdateChatDto {
  @ApiProperty({ description: 'Conversation title' })
  @IsString()
  @MaxLength(255)
  title: string;
}

export class SendMessageDto {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;
}

export class GetMessagesDto {
  @ApiPropertyOptional({
    description: 'Number of messages to return',
    default: 50,
  })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of messages to skip',
    default: 0,
  })
  @IsOptional()
  offset?: number;
}

export class ChatConversationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  threadId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  lastMessage?: string;

  @ApiPropertyOptional()
  lastMessageAt?: Date;
}

export class ChatMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedChatResponseDto {
  @ApiProperty({ type: [ChatConversationDto] })
  data: ChatConversationDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit?: number;

  @ApiProperty()
  offset?: number;
}

export class PaginatedMessagesResponseDto {
  @ApiProperty({ type: [ChatMessageDto] })
  data: ChatMessageDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit?: number;

  @ApiProperty()
  offset?: number;
}
