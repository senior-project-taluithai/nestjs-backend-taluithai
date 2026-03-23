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

  async findByName(name: string): Promise<Province | null> {
    const normalizedName = name.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');

    if (!normalizedName) {
      return null;
    }

    const exact = await this.provincesRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name) = LOWER(:name)', { name: normalizedName })
      .orWhere('LOWER(p.name_en) = LOWER(:name)', { name: normalizedName })
      .getOne();

    if (exact) {
      return exact;
    }

    return this.provincesRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name) LIKE LOWER(:name)', { name: `%${normalizedName}%` })
      .orWhere('LOWER(p.name_en) LIKE LOWER(:name)', {
        name: `%${normalizedName}%`,
      })
      .getOne();
  }

  async findByNameEn(name: string): Promise<Province | null> {
    return this.findByName(name);
  }

  async create(createProvinceDto: CreateProvinceDto): Promise<Province> {
    const newProvince = this.provincesRepository.create(createProvinceDto);
    return this.provincesRepository.save(newProvince);
  }
}
