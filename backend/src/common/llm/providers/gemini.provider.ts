import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { LlmProvider, LlmResponse } from '../interfaces/llm-provider.interface';

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'Gemini';
  private llm: ChatGoogleGenerativeAI | null = null;
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY')?.replace(/"/g, '');
    const model = this.configService.get<string>('GEMINI_LLM_MODEL') || 'gemini-flash-latest';

    if (apiKey) {
      this.llm = new ChatGoogleGenerativeAI({
        model,
        apiKey,
      });
    } else {
      this.logger.warn('Google API Key not configured. GeminiProvider will be unavailable.');
    }
  }

  async generate(prompt: string, options?: any): Promise<LlmResponse> {
    if (!this.llm) {
      throw new Error('Gemini API key is not configured');
    }
    const response = await this.llm.invoke(prompt, options);
    return {
      content: String(response.content),
    };
  }
}
