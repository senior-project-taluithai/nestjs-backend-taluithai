import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ProvincesService } from './provinces.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Provinces')
@Controller('provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all provinces' })
  @ApiResponse({ status: 200, description: 'Return all provinces.' })
  findAll() {
    return this.provincesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get province by id' })
  @ApiResponse({ status: 200, description: 'Return province.' })
  findOne(@Param('id') id: string) {
    return this.provincesService.findOne(+id);
  }
  
  // Optional: Endpoint to seed or create province, mainly for admin
  @Post()
  @ApiOperation({ summary: 'Create province' })
  create(@Body() body: any) {
    return this.provincesService.create(body);
  }
}
