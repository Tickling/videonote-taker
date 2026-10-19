import { MissingApiKeyError } from '@domain/errors';
import { SummaryProvider } from '@domain/valueObjects/Providers';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import type { ISummaryService } from '@domain/ports/ISummaryService';

/** Стратегия: Groq (по умолчанию, бесплатно) или OpenAI GPT-4o (если выбран и есть ключ). */
export class SummaryServiceFactory {
  constructor(
    private readonly groqProvider: ISummaryService,
    private readonly openaiProvider: ISummaryService,
    private readonly settings: ISettingsRepository,
  ) {}

  async getService(): Promise<{ service: ISummaryService; provider: SummaryProvider }> {
    const settings = await this.settings.get();
    if (settings.summaryProvider === SummaryProvider.OPENAI_GPT4O && settings.openaiApiKey) {
      return { service: this.openaiProvider, provider: SummaryProvider.OPENAI_GPT4O };
    }
    if (!settings.groqApiKey) {
      throw new MissingApiKeyError(
        'groq',
        settings.summaryProvider === SummaryProvider.OPENAI_GPT4O
          ? 'Выбран GPT-4o, но ключ OpenAI не указан. Добавьте ключ OpenAI или бесплатный ключ Groq в настройках ⚙️.'
          : undefined,
      );
    }
    // По умолчанию — Groq (бесплатно)
    return { service: this.groqProvider, provider: SummaryProvider.GROQ };
  }
}
