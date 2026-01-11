import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';

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

  async create(province: Partial<Province>): Promise<Province> {
    const newProvince = this.provincesRepository.create(province);
    return this.provincesRepository.save(newProvince);
  }
}
