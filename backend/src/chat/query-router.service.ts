import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export type QueryRoute = 'GENERAL_CHAT' | 'RAG' | 'TOOL';

const FAST_RULES = new Set([
  'hi', 'hello', 'hey', 'good morning', 'good night', 'good afternoon', 
  'how are you', 'thank you', 'thanks', 'welcome', 'bye', 'goodbye',
  'hi there', 'hello there', 'whats up', 'whatup', 'help'
]);

@Injectable()
export class QueryRouterService {
  private readonly routerLlm: ChatGoogleGenerativeAI;
  private readonly logger = new Logger(QueryRouterService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY')?.replace(/"/g, '');
    const model = this.configService.get<string>('GEMINI_LLM_MODEL') || 'gemini-flash-latest';

    this.routerLlm = new ChatGoogleGenerativeAI({
      model,
      apiKey,
    });
  }

  async route(question: string): Promise<QueryRoute> {
    // 1. Fast Rule Engine Check
    const normalized = question
      .toLowerCase()
      .trim()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '');

    if (FAST_RULES.has(normalized)) {
      this.logger.log(`Fast-rule matched for greeting/smalltalk: "${normalized}". Routing to GENERAL_CHAT.`);
      return 'GENERAL_CHAT';
    }

    // Mock router check
    if (process.env.USE_MOCK_LLM === 'true') {
      const isGeneral = /^(who are you|what is your name|how's it going|tell me a joke|explain|hello|hi|what is)/i.test(normalized) && 
                        !/(charge|fine|star|fee|speed|violation|parking|permit|code|rule|document|file|sheet|read)/i.test(normalized);
      return isGeneral ? 'GENERAL_CHAT' : 'RAG';
    }

    // 2. LLM-based Router
    const routerPrompt = `You are an AI Query Router. Analyze the user's input and classify it into one of these routes:
1. GENERAL_CHAT: Greeting, smalltalk, general knowledge, questions about you (e.g. who are you), or generic chatter not requiring document search.
2. RAG: Requests for facts, rules, codes, pricing, details, policies, summaries, or lookup that requires searching the user's uploaded files.
3. TOOL: Request for math calculations or external tool operations.

Response format MUST be a valid JSON object matching this schema:
{
  "route": "GENERAL_CHAT" | "RAG" | "TOOL"
}
Do not output any other text, markdown formatting, or explanation.

User Input: "${question}"`;

    try {
      const response = await this.runWithRetry(async () => {
        return await this.routerLlm.invoke(routerPrompt);
      }, 2, 1000);

      const content = String(response.content).trim();
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned) as { route: string };

      if (parsed.route === 'GENERAL_CHAT' || parsed.route === 'RAG' || parsed.route === 'TOOL') {
        this.logger.log(`Router LLM classified query as: ${parsed.route}`);
        return parsed.route;
      }
    } catch (err) {
      this.logger.warn(`Router LLM failed or returned invalid JSON: ${err.message}. Defaulting to RAG.`);
    }

    return 'RAG';
  }

  private async runWithRetry<T>(fn: () => Promise<T>, retries = 3, initialDelayMs = 2000): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error.message || '';
      const isRateLimit = errorMessage.includes('429') || 
                          errorMessage.includes('Quota exceeded') ||
                          errorMessage.includes('Too Many Requests');
      
      if (isRateLimit && retries > 0) {
        let sleepTime = initialDelayMs;
        const match = errorMessage.match(/Please retry in (\d+(\.\d+)?)/);
        if (match && match[1]) {
          sleepTime = Math.ceil(parseFloat(match[1]) * 1000) + 1000;
        }
        
        if (sleepTime > 5000) {
          throw new Error('AI_RATE_LIMIT_EXCEEDED');
        }

        this.logger.warn(`Gemini Router LLM Rate limit hit. Waiting ${sleepTime / 1000} seconds before retrying (Retries left: ${retries})...`);
        await new Promise(resolve => setTimeout(resolve, sleepTime));
        return this.runWithRetry(fn, retries - 1, initialDelayMs * 2);
      }
      throw error;
    }
  }
}
