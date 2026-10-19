import OpenAI from 'openai';
import type { IApiKeyValidator, KeyValidationResult } from '@domain/ports/IApiKeyValidator';
import { GROQ_BASE_URL } from '../providers/llm/GroqProvider';

/** Проверка ключа тестовым запросом (список моделей — бесплатный и быстрый). */
export class ApiKeyValidator implements IApiKeyValidator {
  async validate(provider: 'groq' | 'openai', apiKey: string): Promise<KeyValidationResult> {
    const client = new OpenAI({
      apiKey,
      ...(provider === 'groq' ? { baseURL: GROQ_BASE_URL } : {}),
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: 15_000,
    });
    const name = provider === 'groq' ? 'Groq' : 'OpenAI';
    try {
      await client.models.list();
      return { valid: true };
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
        return {
          valid: false,
          reason: 'invalid',
          message: provider === 'groq' ? 'Ключ Groq не подошёл (должен начинаться с gsk_)' : 'Ключ OpenAI не подошёл (должен начинаться с sk-)',
        };
      }
      if (error instanceof OpenAI.RateLimitError) {
        return { valid: false, reason: 'rate_limited', message: `${name}: лимит запросов, ключ сохранён без проверки` };
      }
      return { valid: false, reason: 'network', message: `Не удалось связаться с ${name} для проверки ключа — ключ сохранён без проверки` };
    }
  }
}
