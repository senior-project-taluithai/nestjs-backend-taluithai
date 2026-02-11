import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Trip, TripDay, TripItem } from './entities/trip.entity';
import { Province } from '../provinces/entities/province.entity';
import { CreateTripDto, UpdateTripDto } from './dto/create-trip.dto';
import { PlacesService } from '../places/places.service';
import { EventsService } from '../events/events.service';
import { CreateTripDayItemDto, UpdateTripDayItemDto, ReorderTripDayItemsDto } from './dto/trip-day-item.dto';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepository: Repository<Trip>,
    @InjectRepository(Province)
    private provincesRepository: Repository<Province>,
    @InjectRepository(TripDay)
    private tripDaysRepository: Repository<TripDay>,
    private placesService: PlacesService,
    private eventsService: EventsService,
  ) {}

  async findAll(userId: string): Promise<Trip[]> {
    return this.tripsRepository.find({
      where: { userId },
      relations: ['provinces', 'tripDays'],
      order: { startDate: 'DESC' },
    });
  }

  async findOne(id: number, userId: string): Promise<Trip | null> {
    const trip = await this.tripsRepository.findOne({
      where: { id, userId },
      relations: ['provinces', 'tripDays'],
    });

    if (!trip) return null;

    // Enrich trip items with Place/Event details
    const placeIds: number[] = [];
    const eventIds: number[] = [];

    // Collect all IDs
    trip.tripDays.forEach(day => {
      day.items.forEach(item => {
        if (item.place_id) placeIds.push(item.place_id);
        if (item.event_id) eventIds.push(item.event_id);
      });
    });

    // Fetch details
    const places = placeIds.length > 0 ? await this.placesService.findByIds([...new Set(placeIds)]) : [];
    const events = eventIds.length > 0 ? await this.eventsService.findByIds([...new Set(eventIds)]) : [];

    // Create maps for O(1) lookup
    const placeMap = new Map(places.map(p => [p.id, p]));
    const eventMap = new Map(events.map(e => [e.id, e]));

    // Attach details to items
    trip.tripDays.forEach(day => {
      day.items.forEach(item => {
        if (item.place_id) {
          item.place = placeMap.get(item.place_id);
        }
        if (item.event_id) {
          item.event = eventMap.get(item.event_id);
        }
      });
    });

    return trip;
  }

  async create(userId: string, createTripDto: CreateTripDto): Promise<Trip> {
    // Load provinces
    const provinces = await this.provincesRepository.find({
      where: { id: In(createTripDto.province_ids) },
    });

    if (provinces.length !== createTripDto.province_ids.length) {
      throw new NotFoundException('One or more provinces not found');
    }

    // Generate trip days based on date range
    const tripDays = this.generateTripDays(
      createTripDto.start_date,
      createTripDto.end_date,
    );

    // Create trip
    const newTrip = this.tripsRepository.create({
      userId,
      name: createTripDto.name,
      startDate: new Date(createTripDto.start_date),
      endDate: new Date(createTripDto.end_date),
      status: createTripDto.status,
      provinces,
      tripDays,
    });

    return this.tripsRepository.save(newTrip);
  }

  async update(
    id: number,
    userId: string,
    updateTripDto: UpdateTripDto,
  ): Promise<Trip | null> {
    const existing = await this.findOne(id, userId);
    if (!existing) return null;

    // Update provinces if provided
    if (updateTripDto.province_ids) {
      const provinces = await this.provincesRepository.find({
        where: { id: In(updateTripDto.province_ids) },
      });

      if (provinces.length !== updateTripDto.province_ids.length) {
        throw new NotFoundException('One or more provinces not found');
      }

      existing.provinces = provinces;
    }

    // Update basic fields
    if (updateTripDto.name) existing.name = updateTripDto.name;
    if (updateTripDto.status) existing.status = updateTripDto.status;

    // Update dates and regenerate trip days if dates changed
    if (updateTripDto.start_date || updateTripDto.end_date) {
      const newStartDate = updateTripDto.start_date
        ? new Date(updateTripDto.start_date)
        : existing.startDate;
      const newEndDate = updateTripDto.end_date
        ? new Date(updateTripDto.end_date)
        : existing.endDate;

      existing.startDate = newStartDate;
      existing.endDate = newEndDate;

      // Regenerate trip days (this will replace existing days)
      // In a real app, you might want to preserve existing items
      existing.tripDays = this.generateTripDays(
        newStartDate.toISOString(),
        newEndDate.toISOString(),
      );
    }

    return this.tripsRepository.save(existing);
  }

  async remove(id: number, userId: string): Promise<void> {
    await this.tripsRepository.delete({ id, userId });
  }

  private generateTripDays(startDate: string, endDate: string): TripDay[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days: TripDay[] = [];

    let currentDate = new Date(start);
    let dayNumber = 1;

    while (currentDate <= end) {
      const tripDay = new TripDay();
      tripDay.dayNumber = dayNumber;
      tripDay.date = new Date(currentDate);
      tripDay.items = [];

      days.push(tripDay);

      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }

    return days;
  }

  // ============ Recommendations ============

  async getRecommendedPlaces(
    tripId: number,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const provinceIds = trip.provinces.map((p) => p.id);
    
    // Get recommended places filtered by provinces
    const allPlaces = await this.placesService.getRecommended();
    
    // Filter to only include places from trip's provinces
    const filteredData = allPlaces.filter((place) =>
      provinceIds.includes(place.province.id),
    );

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      page,
      lastPage: Math.ceil(filteredData.length / limit),
      total: filteredData.length,
    };
  }

  async getRecommendedEvents(
    tripId: number,
    userId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const provinceIds = trip.provinces.map((p) => p.id);
    
    // Get recommended events filtered by provinces
    const allEvents = await this.eventsService.getRecommended();
    
    // Filter to only include events from trip's provinces
    const filteredData = allEvents.filter((event) =>
      provinceIds.includes(event.provinceId),
    );

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      page,
      lastPage: Math.ceil(filteredData.length / limit),
      total: filteredData.length,
    };
  }

  // ============ Places in Trip Provinces ============

  async getPlacesInTripProvinces(
    tripId: number,
    userId: string,
    page: number = 1,
    limit: number = 8,
    search?: string,
    category?: string,
  ) {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const provinceIds = trip.provinces.map((p) => p.id);
    
    // Get all places with filters
    const result = await this.placesService.findAll({
      searchTerm: search,
      provinces: provinceIds,
      categoryId: category ? parseInt(category) : undefined,
      page,
      limit,
    });
    
    return result;
  }

  // ============ Trip Day Item Management ============

  async addItemToTripDay(
    tripId: number,
    dayNumber: number,
    userId: string,
    createItemDto: CreateTripDayItemDto,
  ): Promise<TripDay> {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const tripDay = trip.tripDays.find((d) => d.dayNumber === dayNumber);
    if (!tripDay) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Verify the item exists
    if (createItemDto.item_type === 'place') {
      const place = await this.placesService.findOne(createItemDto.item_id);
      if (!place) {
        throw new NotFoundException('Place not found');
      }
    } else if (createItemDto.item_type === 'event') {
      const event = await this.eventsService.findOne(createItemDto.item_id);
      if (!event) {
        throw new NotFoundException('Event not found');
      }
    }

    // Generate new item ID
    const maxId = tripDay.items.length > 0
      ? Math.max(...tripDay.items.map((i) => i.id))
      : 0;

    // Determine order
    const order = createItemDto.order !== undefined
      ? createItemDto.order
      : tripDay.items.length;

    const newItem: TripItem = {
      id: maxId + 1,
      [createItemDto.item_type === 'place' ? 'place_id' : 'event_id']: createItemDto.item_id,
      note: createItemDto.note,
      order,
      start_time: createItemDto.start_time,
      end_time: createItemDto.end_time,
    };

    tripDay.items.push(newItem);
    
    // Sort by order
    tripDay.items.sort((a, b) => a.order - b.order);

    await this.tripDaysRepository.save(tripDay);
    return tripDay;
  }

  async updateTripDayItem(
    tripId: number,
    dayNumber: number,
    itemId: number,
    userId: string,
    updateItemDto: UpdateTripDayItemDto,
  ): Promise<TripDay> {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const tripDay = trip.tripDays.find((d) => d.dayNumber === dayNumber);
    if (!tripDay) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    const itemIndex = tripDay.items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) {
      throw new NotFoundException('Item not found in this day');
    }

    // Update item
    tripDay.items[itemIndex] = {
      ...tripDay.items[itemIndex],
      ...updateItemDto,
    };

    // Re-sort if order changed
    if (updateItemDto.order !== undefined) {
      tripDay.items.sort((a, b) => a.order - b.order);
    }

    await this.tripDaysRepository.save(tripDay);
    return tripDay;
  }

  async removeTripDayItem(
    tripId: number,
    dayNumber: number,
    itemId: number,
    userId: string,
  ): Promise<TripDay> {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const tripDay = trip.tripDays.find((d) => d.dayNumber === dayNumber);
    if (!tripDay) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    const itemIndex = tripDay.items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) {
      throw new NotFoundException('Item not found in this day');
    }

    tripDay.items.splice(itemIndex, 1);

    await this.tripDaysRepository.save(tripDay);
    return tripDay;
  }

  async reorderTripDayItems(
    tripId: number,
    dayNumber: number,
    userId: string,
    reorderDto: ReorderTripDayItemsDto,
  ): Promise<TripDay> {
    const trip = await this.findOne(tripId, userId);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const tripDay = trip.tripDays.find((d) => d.dayNumber === dayNumber);
    if (!tripDay) {
      throw new NotFoundException(`Day ${dayNumber} not found`);
    }

    // Update orders
    reorderDto.items.forEach(({ id, order }) => {
      const item = tripDay.items.find((i) => i.id === id);
      if (item) {
        item.order = order;
      }
    });

    // Sort by new order
    tripDay.items.sort((a, b) => a.order - b.order);

    await this.tripDaysRepository.save(tripDay);
    return tripDay;
  }
}
