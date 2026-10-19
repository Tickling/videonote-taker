import type { IApiKeyValidator } from '@domain/ports/IApiKeyValidator';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import { SummaryProvider, TranscriptionProvider } from '@domain/valueObjects/Providers';
import { normalizeApiKey, type UserSettings } from '@domain/valueObjects/UserSettings';

export type SettingsFieldError = { field: 'groqApiKey' | 'openaiApiKey' | 'backendUrl'; message: string };

export type SaveSettingsResult =
  | { ok: true; settings: UserSettings; warnings: string[] }
  | { ok: false; errors: SettingsFieldError[] };

export class SaveSettingsUseCase {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly validator: IApiKeyValidator,
  ) {}

  async execute(input: UserSettings): Promise<SaveSettingsResult> {
    const next: UserSettings = {
      ...input,
      groqApiKey: normalizeApiKey(input.groqApiKey),
      openaiApiKey: normalizeApiKey(input.openaiApiKey),
      backendUrl: input.backendUrl.trim().replace(/\/+$/, ''),
    };
    const previous = await this.settings.get();
    const errors: SettingsFieldError[] = [];
    const warnings: string[] = [];

    if (!/^https?:\/\/[^\s/]+/i.test(next.backendUrl)) {
      errors.push({ field: 'backendUrl', message: 'Адрес сервера должен начинаться с http:// или https://' });
    }

    const needsOpenAi =
      next.summaryProvider === SummaryProvider.OPENAI_GPT4O ||
      next.transcriptionProvider === TranscriptionProvider.OPENAI_WHISPER;
    if (needsOpenAi && !next.openaiApiKey) {
      errors.push({ field: 'openaiApiKey', message: 'Для выбранных функций OpenAI нужен API-ключ' });
    }

    // Проверяем тестовым запросом только новые/изменённые ключи
    const checks: Array<['groq' | 'openai', string]> = [];
    if (next.groqApiKey && next.groqApiKey !== previous.groqApiKey) checks.push(['groq', next.groqApiKey]);
    if (next.openaiApiKey && next.openaiApiKey !== previous.openaiApiKey) checks.push(['openai', next.openaiApiKey]);

    const results = await Promise.all(checks.map(async ([provider, key]) => ({ provider, result: await this.validator.validate(provider, key) })));
    for (const { provider, result } of results) {
      if (result.valid) continue;
      const field = provider === 'groq' ? 'groqApiKey' : 'openaiApiKey';
      if (result.reason === 'invalid') errors.push({ field, message: result.message });
      else warnings.push(result.message);
    }

    if (errors.length > 0) return { ok: false, errors };
    await this.settings.save(next);
    return { ok: true, settings: next, warnings };
  }
}
