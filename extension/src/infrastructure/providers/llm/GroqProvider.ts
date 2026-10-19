import type { ILogger } from '@domain/ports/ILogger';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import { SummaryProvider } from '@domain/valueObjects/Providers';
import type { UserSettings } from '@domain/valueObjects/UserSettings';
import { OpenAICompatibleSummaryProvider } from './OpenAICompatibleSummaryProvider';

// VITE_GROQ_BASE_URL — только для e2e-сборки с поддельным сервером
export const GROQ_BASE_URL = import.meta.env.VITE_GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

/** Бесплатно: Groq через OpenAI SDK с другим baseURL. */
export class GroqProvider extends OpenAICompatibleSummaryProvider {
  constructor(settings: ISettingsRepository, logger: ILogger) {
    super(
      {
        provider: SummaryProvider.GROQ,
        keyName: 'groq',
        baseURL: GROQ_BASE_URL,
        model: GROQ_MODEL,
        maxCharsPerRequest: 14_000,
        maxOutputTokens: 3_000,
      },
      settings,
      logger,
    );
  }

  protected pickKey(settings: UserSettings): string | null {
    return settings.groqApiKey;
  }
}
