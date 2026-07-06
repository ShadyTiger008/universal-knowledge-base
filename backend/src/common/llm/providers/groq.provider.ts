import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmResponse } from '../interfaces/llm-provider.interface';

@Injectable()
export class GroqProvider implements LlmProvider {
  readonly name = 'Groq';
  private readonly logger = new Logger(GroqProvider.name);
  private readonly apiKey: string | null = null;
  private readonly modelName: string;
  private readonly timeoutMs = 10000; // 10 seconds timeout

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY')?.replace(/"/g, '') || null;
    this.modelName = this.configService.get<string>('GROQ_LLM_MODEL') || 'llama-3.3-70b-versatile';
  }

  async generate(prompt: string, options?: any): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error('Groq API key is not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Groq API returned status ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as any;
      const content = data?.choices?.[0]?.message?.content;

      if (content === undefined || content === null) {
        throw new Error('Groq API returned malformed or empty response content');
      }

      return { content: String(content) };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Groq API request timed out after 10 seconds');
      }
      throw error;
    }
  }
}
