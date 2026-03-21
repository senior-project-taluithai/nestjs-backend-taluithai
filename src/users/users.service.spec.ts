import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { TravelPreference } from '../travel-preferences/entities/travel-preference.entity';
import { Repository, In } from 'typeorm';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: Repository<User>;
  let travelPreferenceRepository: Repository<TravelPreference>;

  const mockUserRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockTravelPreferenceRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(TravelPreference),
          useValue: mockTravelPreferenceRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    travelPreferenceRepository = module.get<Repository<TravelPreference>>(getRepositoryToken(TravelPreference));
    
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create and save a user', async () => {
      const userData = { email: 'test@example.com' };
      mockUserRepository.create.mockReturnValue(userData);
      mockUserRepository.save.mockResolvedValue({ id: '1', ...userData });

      const result = await service.create(userData);
      expect(userRepository.create).toHaveBeenCalledWith(userData);
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('1');
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const email = 'test@example.com';
      mockUserRepository.findOne.mockResolvedValue({ id: '1', email });

      const result = await service.findByEmail(email);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(result.email).toBe(email);
    });
  });

  describe('findOne', () => {
    it('should find a user by id', async () => {
      const id = '1';
      mockUserRepository.findOne.mockResolvedValue({ id, email: 'test@example.com' });

      const result = await service.findOne(id);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id } });
      expect(result.id).toBe(id);
    });
  });

  describe('findByResetToken', () => {
    it('should find a user by reset token', async () => {
      const token = 'token';
      mockUserRepository.findOne.mockResolvedValue({ id: '1', resetToken: token });

      const result = await service.findByResetToken(token);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { resetToken: token } });
      expect(result.resetToken).toBe(token);
    });
  });

  describe('update', () => {
    it('should call repository.update', async () => {
      const id = '1';
      const data = { firstName: 'John' };
      await service.update(id, data);
      expect(userRepository.update).toHaveBeenCalledWith(id, data);
    });
  });

  describe('getUserPreferences', () => {
    it('should return travel preferences of a user', async () => {
      const userId = '1';
      const prefs = [{ id: 1, name: 'Adventure' }];
      mockUserRepository.findOne.mockResolvedValue({ id: userId, travelPreferences: prefs });

      const result = await service.getUserPreferences(userId);
      expect(userRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: userId },
        relations: ['travelPreferences'],
      }));
      expect(result).toEqual(prefs);
    });

    it('should return empty array if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const result = await service.getUserPreferences('1');
      expect(result).toEqual([]);
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences and return them', async () => {
      const userId = '1';
      const prefIds = [1, 2];
      const user = { id: userId, travelPreferences: [] };
      const prefs = [{ id: 1 }, { id: 2 }];

      mockUserRepository.findOne.mockResolvedValue(user);
      mockTravelPreferenceRepository.find.mockResolvedValue(prefs);
      mockUserRepository.save.mockResolvedValue({ ...user, travelPreferences: prefs });

      const result = await service.updateUserPreferences(userId, prefIds);
      expect(travelPreferenceRepository.find).toHaveBeenCalledWith({
        where: { id: In(prefIds) },
      });
      expect(userRepository.save).toHaveBeenCalled();
      expect(result).toEqual(prefs);
    });

    it('should return empty array if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      const result = await service.updateUserPreferences('1', [1]);
      expect(result).toEqual([]);
    });
  });

  describe('getRecommendationPreferences', () => {
    it('should return recommendation preferences', async () => {
      const userId = '1';
      const prefs = { preferredCategoryIds: [1], preferredRegions: ['North'] };
      mockUserRepository.findOne.mockResolvedValue({ id: userId, ...prefs });

      const result = await service.getRecommendationPreferences(userId);
      expect(result).toEqual(prefs);
    });
  });

  describe('updateRecommendationPreferences', () => {
    it('should update and return recommendation preferences', async () => {
      const userId = '1';
      const user = { id: userId, preferredCategoryIds: [], preferredRegions: [] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue(user);

      const result = await service.updateRecommendationPreferences(userId, [1], ['North ']);
      expect(result.preferredCategoryIds).toEqual([1]);
      expect(result.preferredRegions).toEqual(['North']);
      expect(userRepository.save).toHaveBeenCalled();
    });
  });
});
