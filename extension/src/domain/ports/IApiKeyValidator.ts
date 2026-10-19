export type KeyValidationResult =
  | { valid: true }
  | { valid: false; reason: 'invalid' | 'network' | 'rate_limited'; message: string };

export interface IApiKeyValidator {
  validate(provider: 'groq' | 'openai', apiKey: string): Promise<KeyValidationResult>;
}
