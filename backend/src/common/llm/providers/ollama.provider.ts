import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmResponse } from '../interfaces/llm-provider.interface';

@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name = 'Ollama';
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly host: string;
  private readonly modelName: string;
  private readonly timeoutMs = 15000; // 15 seconds timeout

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>('OLLAMA_HOST') || 'http://localhost:11434';
    this.modelName = this.configService.get<string>('OLLAMA_LLM_MODEL') || 'llama3';
  }

  async generate(prompt: string, options?: any): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const url = `${this.host.replace(/\/$/, '')}/v1/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        throw new Error(`Ollama API returned status ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as any;
      const content = data?.choices?.[0]?.message?.content;

      if (content === undefined || content === null) {
        throw new Error('Ollama API returned malformed or empty response content');
      }

      return { content: String(content) };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Ollama API request timed out after 15 seconds at ${url}`);
      }
      throw error;
    }
  }
}
