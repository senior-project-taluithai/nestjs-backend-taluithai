import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get my travel preferences' })
  @ApiResponse({ status: 200, description: 'Return list of preferences.' })
  async getMyPreferences(@Req() req) {
    return this.usersService.getUserPreferences(req.user.id);
  }

  @Post('me/preferences')
  @ApiOperation({ summary: 'Update my travel preferences (replace all)' })
  @ApiResponse({ status: 200, description: 'Preferences updated.' })
  @ApiBody({ type: UpdateUserPreferencesDto })
  async updatePreferences(@Req() req, @Body() body: UpdateUserPreferencesDto) {
    return this.usersService.updateUserPreferences(
      req.user.id,
      body.preferenceIds,
    );
  }
}
