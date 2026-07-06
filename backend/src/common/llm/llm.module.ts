import { Module } from '@nestjs/common';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { LlmService } from './llm.service';

@Module({
  providers: [
    GeminiProvider,
    GroqProvider,
    OpenRouterProvider,
    OllamaProvider,
    LlmService,
  ],
  exports: [
    LlmService,
  ],
})
export class LlmModule {}
