import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptBuilderService],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should include rules for structured Markdown tables and conversational summaries', () => {
    const prompt = service.build({
      question: 'What are the charges for robbery?',
      chunks: [
        {
          score: 0.9,
          payload: {
            text: 'CRIME: Robbery\nFINE: $35,000\nWanted Level: 3 Stars',
            documentName: 'LEO Penal Code Guide.xlsx',
          },
        },
      ],
    });

    expect(prompt).toContain('Whenever the retrieved context is structured/tabular');
    expect(prompt).toContain('MUST ALWAYS format your response starting with a Markdown table');
    expect(prompt).toContain('The columns of the Markdown table must match the headers/keys');
    expect(prompt).toContain('At the very end of your response (below the detailed answer), ALWAYS add a horizontal rule');
    expect(prompt).toContain('### 💬 Conversational Summary:');
  });
});
