import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';
import { CreateProvinceDto } from './dto/create-province.dto';

@Injectable()
export class ProvincesService {
  constructor(
    @InjectRepository(Province)
    private provincesRepository: Repository<Province>,
  ) {}

  async findAll(): Promise<Province[]> {
    return this.provincesRepository.find();
  }

  async findOne(id: number): Promise<Province | null> {
    return this.provincesRepository.findOne({ where: { id } });
  }

  async findByNameEn(name: string): Promise<Province | null> {
    // Try exact match first
    const exact = await this.provincesRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name_en) = LOWER(:name)', { name })
      .getOne();
    if (exact) return exact;

    // Fallback to LIKE match
    return this.provincesRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name_en) LIKE LOWER(:name)', { name: `%${name}%` })
      .getOne();
  }

  async create(createProvinceDto: CreateProvinceDto): Promise<Province> {
    const newProvince = this.provincesRepository.create(createProvinceDto);
    return this.provincesRepository.save(newProvince);
  }
}
