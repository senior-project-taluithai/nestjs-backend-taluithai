import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingService } from './embedding.service';
import { ConfigService } from '@nestjs/config';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-key') },
        },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encodeOne', () => {
    it('should call HuggingFace API and return embedding', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
        })
      });

      const result = await service.encodeOne('test');
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error if API fails', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Error'
        });
        await expect(service.encodeOne('test')).rejects.toThrow();
    });
  });
});
