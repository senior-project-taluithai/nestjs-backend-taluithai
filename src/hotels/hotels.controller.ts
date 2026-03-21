import {
  Controller,
  Get,
  Query,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';

class HotelLookupResponseDto {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  priceRange: string;
  thumbnail: string;
  website: string;
  bookingUrl: string;
  imageUrls: string[];
}

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get('lookup')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary: 'Look up a hotel by name and location to get booking URL',
  })
  @ApiQuery({ name: 'name', required: true, description: 'Hotel name' })
  @ApiQuery({
    name: 'location',
    required: false,
    description: 'Location/province',
  })
  @ApiResponse({
    status: 200,
    description: 'Hotel lookup result with booking URL',
    type: HotelLookupResponseDto,
  })
  async lookupHotel(
    @Query('name') name: string,
    @Query('location') location?: string,
  ): Promise<HotelLookupResponseDto> {
    if (!name) {
      throw new NotFoundException('Hotel name is required');
    }

    let hotels: any[] = [];

    if (location) {
      const provinceHotels = await this.hotelsService.findByProvinceName(
        location,
        20,
      );
      hotels = provinceHotels.filter((h) =>
        h.name.toLowerCase().includes(name.toLowerCase()),
      );
    }

    if (hotels.length === 0) {
      const { data } = await this.hotelsService.findAll({
        searchTerm: name,
        limit: 20,
      });
      hotels = data.filter((h) =>
        h.name.toLowerCase().includes(name.toLowerCase()),
      );
    }

    if (hotels.length === 0) {
      throw new NotFoundException(`Hotel not found: ${name}`);
    }

    const hotel = hotels[0];
    return {
      id: hotel.id,
      name: hotel.name,
      address: hotel.address || '',
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      rating: hotel.rating,
      reviewCount: hotel.userRatingCount || 0,
      priceRange: hotel.priceRange || '',
      thumbnail: hotel.thumbnailUrl || hotel.images?.[0]?.url || '',
      website: hotel.website || '',
      bookingUrl: hotel.bookingUrl || '',
      imageUrls: hotel.images?.map((img: any) => img.url) || [],
    };
  }

  @Get('booking/:id')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary: 'Get hotel booking URL by database ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Hotel booking URL',
  })
  async getHotelBookingUrl(
    @Param('id') id: string,
  ): Promise<{ bookingUrl: string }> {
    const hotel = await this.hotelsService.findById(parseInt(id, 10));
    if (!hotel) {
      throw new NotFoundException(`Hotel not found with id: ${id}`);
    }
    return { bookingUrl: hotel.bookingUrl || '' };
  }
}
