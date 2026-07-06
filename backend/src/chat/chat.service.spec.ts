import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { GeminiEmbeddingProvider } from '../common/embedding/providers/gemini-embedding.provider';
import { QdrantService } from '../common/qdrant/qdrant.service';
import { PrismaService } from '../database/prisma.service';
import { PromptBuilderService } from '../common/prompt/prompt-builder.service';
import { RedisService } from '../common/redis/redis.service';
import { QueryRouterService } from './query-router.service';
import { LlmService } from '../common/llm/llm.service';
import { ConfigService } from '@nestjs/config';

describe('ChatService Mock LLM Integration', () => {
  let service: ChatService;
  let qdrantService: QdrantService;

  const mockEmbeddingProvider = {
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };

  const mockQdrantService = {
    search: jest.fn(),
  };

  const mockPrismaService = {
    message: {
      create: jest.fn(),
    },
  };

  const mockPromptBuilderService = {
    build: jest.fn().mockReturnValue('Mock Prompt'),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'USE_MOCK_LLM') return 'true';
      return null;
    }),
  };

  const mockQueryRouterService = {
    route: jest.fn().mockResolvedValue('RAG'),
  };

  const mockLlmService = {
    generate: jest.fn(),
  };

  beforeEach(async () => {
    process.env.USE_MOCK_LLM = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: GeminiEmbeddingProvider, useValue: mockEmbeddingProvider },
        { provide: QdrantService, useValue: mockQdrantService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QueryRouterService, useValue: mockQueryRouterService },
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    qdrantService = module.get<QdrantService>(QdrantService);
  });

  afterEach(() => {
    delete process.env.USE_MOCK_LLM;
  });

  it('should generate a 2D Markdown table from multiple structured context chunks', async () => {
    mockQdrantService.search.mockResolvedValue([
      {
        id: '1',
        score: 0.95,
        payload: {
          text: 'CRIME: Robbery\nFINE: $35,000\nWanted Level: 3 Stars',
          documentName: 'LEO Penal Code Guide.xlsx',
          sheetName: 'Penal Code',
        },
      },
      {
        id: '2',
        score: 0.85,
        payload: {
          text: 'CRIME: Looting ATM\nFINE: $8,000\nWanted Level: 1 Star',
          documentName: 'LEO Penal Code Guide.xlsx',
          sheetName: 'Penal Code',
        },
      },
    ]);

    const result = await service.query({
      question: 'What are the robbery charges?',
      topK: 2,
    });

    expect(result.llm.answer).toContain('| CRIME | FINE | Wanted Level |');
    expect(result.llm.answer).toContain('| Robbery | $35,000 | 3 Stars |');
    expect(result.llm.answer).toContain('| Looting ATM | $8,000 | 1 Star |');
    expect(result.llm.answer).toContain('### 💬 Conversational Summary:');
    expect(result.llm.answer).toContain("Alright Sir/Ma'am today you are being charged with **Robbery**.");
    expect(result.llm.answer).toContain("Alright Sir/Ma'am today you are being charged with **Looting ATM**.");
  });
});
