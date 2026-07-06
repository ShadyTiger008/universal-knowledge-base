import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmResponse } from './interfaces/llm-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { OllamaProvider } from './providers/ollama.provider';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly providers: LlmProvider[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiProvider: GeminiProvider,
    private readonly groqProvider: GroqProvider,
    private readonly openRouterProvider: OpenRouterProvider,
    private readonly ollamaProvider: OllamaProvider,
  ) {
    // Dynamically build the fallback chain based on configuration keys
    const hasGemini = !!this.configService.get<string>('GOOGLE_API_KEY');
    const hasGroq = !!this.configService.get<string>('GROQ_API_KEY');
    const hasOpenRouter = !!this.configService.get<string>('OPENROUTER_API_KEY');

    if (hasGemini) {
      this.providers.push(this.geminiProvider);
    } else {
      this.logger.warn('GeminiProvider skipped (GOOGLE_API_KEY missing)');
    }

    if (hasGroq) {
      this.providers.push(this.groqProvider);
    } else {
      this.logger.warn('GroqProvider skipped (GROQ_API_KEY missing)');
    }

    if (hasOpenRouter) {
      this.providers.push(this.openRouterProvider);
    } else {
      this.logger.warn('OpenRouterProvider skipped (OPENROUTER_API_KEY missing)');
    }

    // Ollama is always active as a local final fallback (useful for dev)
    this.providers.push(this.ollamaProvider);

    this.logger.log(
      `Active LLM Fallback chain: ${this.providers.map((p) => p.name).join(' -> ')}`
    );
  }

  async generate(prompt: string, options?: any): Promise<LlmResponse> {
    // Fast mock path for dev testing
    if (this.configService.get<string>('USE_MOCK_LLM') === 'true') {
      this.logger.log('USE_MOCK_LLM is enabled. Returning mock LLM response.');
      return { content: `[Mock LLM Response]: Simulated response for prompt.` };
    }

    if (this.providers.length === 0) {
      throw new Error('No LLM providers are configured or available.');
    }

    let lastError: Error | null = null;

    for (const provider of this.providers) {
      this.logger.log(`Attempting generation with provider: ${provider.name}`);
      try {
        const response = await this.generateWithRetries(provider, prompt, options);
        this.logger.log(`Successfully generated response using provider: ${provider.name}`);
        return response;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `Provider ${provider.name} failed. Error: ${err.message}. Falling back to next provider...`
        );
      }
    }

    throw new Error(
      `All LLM providers in the fallback chain failed. Last error: ${lastError?.message}`
    );
  }

  private async generateWithRetries(
    provider: LlmProvider,
    prompt: string,
    options?: any,
    retriesLeft = 2,
    delayMs = 1500
  ): Promise<LlmResponse> {
    try {
      return await provider.generate(prompt, options);
    } catch (error) {
      const isRetryable = this.isRetryableError(error);

      if (isRetryable && retriesLeft > 0) {
        this.logger.warn(
          `Retryable error on provider ${provider.name}: ${error.message}. Retrying in ${delayMs}ms... (Retries left: ${retriesLeft})`
        );
        
        // Add random jitter (0-200ms) to prevent concurrent stampeding
        const jitter = Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));

        return this.generateWithRetries(
          provider,
          prompt,
          options,
          retriesLeft - 1,
          delayMs * 2
        );
      }

      // If not retryable or retries exhausted, throw error to trigger failover
      throw error;
    }
  }

  private isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();

    // 429 Rate limits / Quota exceeded
    if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
      return true;
    }

    // 5xx Server errors
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return true;
    }

    // Network timeouts / Fetch failures / connection closed
    if (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('abort') ||
      msg.includes('fetch failed')
    ) {
      return true;
    }

    if (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('econnrefused')
    ) {
      return true;
    }

    return false;
  }
}
