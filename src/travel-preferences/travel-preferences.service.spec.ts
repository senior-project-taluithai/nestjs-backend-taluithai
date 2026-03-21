import { Test, TestingModule } from '@nestjs/testing';
import { TravelPreferencesService } from './travel-preferences.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TravelPreference } from './entities/travel-preference.entity';
import { Repository } from 'typeorm';

describe('TravelPreferencesService', () => {
  let service: TravelPreferencesService;
  let repository: Repository<TravelPreference>;

  const mockRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue({ id: 1 }),
    count: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TravelPreferencesService,
        { provide: getRepositoryToken(TravelPreference), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<TravelPreferencesService>(TravelPreferencesService);
    repository = module.get<Repository<TravelPreference>>(getRepositoryToken(TravelPreference));
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all preferences', async () => {
      await service.findAll();
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create and save a preference', async () => {
      await service.create('Nature');
      expect(repository.create).toHaveBeenCalledWith({ name: 'Nature' });
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('createMany', () => {
    it('should create multiple preferences', async () => {
      mockRepository.find.mockResolvedValue([]);
      await service.createMany(['Nature', 'Adventure']);
      expect(repository.save).toHaveBeenCalled();
    });
  });
});
