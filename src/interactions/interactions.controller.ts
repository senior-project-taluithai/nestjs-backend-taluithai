import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';

@ApiTags('Interactions')
@Controller('interactions')
@UseGuards(AuthGuard('jwt'))
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @ApiOperation({ summary: 'Track a user interaction (view, save, add_to_trip, share)' })
  async create(@Req() req, @Body() dto: CreateInteractionDto) {
    return this.interactionsService.create(
      req.user.id,
      dto.place_id,
      dto.event_id,
      dto.interaction_type,
    );
  }
}
