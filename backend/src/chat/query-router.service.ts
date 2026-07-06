import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../common/llm/llm.service';

export type QueryRoute = 'GENERAL_CHAT' | 'RAG' | 'TOOL';

const FAST_RULES = new Set([
  'hi', 'hello', 'hey', 'good morning', 'good night', 'good afternoon', 
  'how are you', 'thank you', 'thanks', 'welcome', 'bye', 'goodbye',
  'hi there', 'hello there', 'whats up', 'whatup', 'help'
]);

@Injectable()
export class QueryRouterService {
  private readonly logger = new Logger(QueryRouterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly llmService: LlmService,
  ) {}

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
      const response = await this.llmService.generate(routerPrompt);
      const content = response.content.trim();
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
}
