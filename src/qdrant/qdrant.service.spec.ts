import { Test, TestingModule } from '@nestjs/testing';
import { QdrantService } from './qdrant.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { ConfigService } from '@nestjs/config';

describe('QdrantService', () => {
  let service: QdrantService;
  let embeddingService: EmbeddingService;

  const mockEmbeddingService = {
    encodeOne: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-url') },
        },
      ],
    }).compile();

    service = module.get<QdrantService>(QdrantService);
    embeddingService = module.get<EmbeddingService>(EmbeddingService);
    (service as any).client = {
      query: jest.fn().mockResolvedValue({
        points: [{ id: '1', score: 0.9, payload: { title: 'Place 1' } }],
      }),
      getCollection: jest.fn().mockResolvedValue({ status: 'green' }),
    };
    (service as any).collectionName = 'test';
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should call embeddingService and Qdrant API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          result: {
            points: [{ id: '1', score: 0.9, payload: { title: 'Place 1' } }],
          },
        }),
      });

      const result = await service.search('query');
      expect(embeddingService.encodeOne).toHaveBeenCalledWith('query');
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Place 1');
    });
  });
});
