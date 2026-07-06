export interface LlmResponse {
  content: string;
}

export interface LlmProvider {
  name: string;
  generate(prompt: string, options?: any): Promise<LlmResponse>;
}
