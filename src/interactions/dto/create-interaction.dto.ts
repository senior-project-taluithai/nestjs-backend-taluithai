import { IsEnum, IsOptional, IsNumber } from 'class-validator';
import { InteractionType } from '../entities/user-interaction.entity';

export class CreateInteractionDto {
  @IsOptional()
  @IsNumber()
  place_id?: number;

  @IsOptional()
  @IsNumber()
  event_id?: number;

  @IsEnum(InteractionType)
  interaction_type: InteractionType;
}
