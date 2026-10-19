import type { ILogger } from '@domain/ports/ILogger';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import { SummaryProvider } from '@domain/valueObjects/Providers';
import type { UserSettings } from '@domain/valueObjects/UserSettings';
import { OpenAICompatibleSummaryProvider } from './OpenAICompatibleSummaryProvider';

export const OPENAI_MODEL = 'gpt-4o';

/** Платно: OpenAI GPT-4o. */
export class OpenAIProvider extends OpenAICompatibleSummaryProvider {
  constructor(settings: ISettingsRepository, logger: ILogger) {
    super(
      {
        provider: SummaryProvider.OPENAI_GPT4O,
        keyName: 'openai',
        model: OPENAI_MODEL,
        maxCharsPerRequest: 80_000,
        maxOutputTokens: 6_000,
      },
      settings,
      logger,
    );
  }

  protected pickKey(settings: UserSettings): string | null {
    return settings.openaiApiKey;
  }
}
