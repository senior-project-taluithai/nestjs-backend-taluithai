import { Controller, Get, Post, Body, Param, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { ProvincesService } from './provinces.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProvinceDto } from './dto/province.dto';
import { CreateProvinceDto } from './dto/create-province.dto';
import { plainToInstance } from 'class-transformer';

@ApiTags('Provinces')
@Controller('provinces')
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get all provinces' })
  @ApiResponse({ status: 200, description: 'Return all provinces.', type: [ProvinceDto] })
  async findAll() {
    const provinces = await this.provincesService.findAll();
    return provinces.map((province) => new ProvinceDto(province));
  }

  @Get(':id')
  @UseInterceptors(ClassSerializerInterceptor)
  @ApiOperation({ summary: 'Get province by id' })
  @ApiResponse({ status: 200, description: 'Return province.', type: ProvinceDto })
  async findOne(@Param('id') id: string) {
    const province = await this.provincesService.findOne(+id);
    if (!province) return null;
    return new ProvinceDto(province);
  }
  
  // Optional: Endpoint to seed or create province, mainly for admin
  @Post()
  @ApiOperation({ summary: 'Create province' })
  @ApiResponse({ status: 201, description: 'The province has been successfully created.', type: ProvinceDto })
  async create(@Body() createProvinceDto: CreateProvinceDto) {
    const province = await this.provincesService.create(createProvinceDto);
    return new ProvinceDto(province);
  }
}
