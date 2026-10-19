import OpenAI from 'openai';
import { summarizeTranscript } from '@shared/summarize';
import type { ChatPrompt } from '@shared/prompts';
import type { Screenshot } from '@domain/entities/Screenshot';
import type { Summary } from '@domain/entities/Summary';
import type { Transcript } from '@domain/entities/Transcript';
import { InvalidApiKeyError, MissingApiKeyError, SummarizationError } from '@domain/errors';
import type { ILogger } from '@domain/ports/ILogger';
import type { ISummaryService, SummaryOptions } from '@domain/ports/ISummaryService';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import type { SummaryProvider } from '@domain/valueObjects/Providers';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import type { UserSettings } from '@domain/valueObjects/UserSettings';
import type { VideoType } from '@domain/valueObjects/VideoType';

export interface ProviderConfig {
  provider: SummaryProvider;
  keyName: 'groq' | 'openai';
  baseURL?: string;
  model: string;
  /** Символов транскрипта на запрос (бесплатный Groq ограничен ~12k токенов/мин) */
  maxCharsPerRequest: number;
  maxOutputTokens: number;
}

/** Общая реализация для любого OpenAI-совместимого API (Groq, OpenAI). */
export abstract class OpenAICompatibleSummaryProvider implements ISummaryService {
  protected constructor(
    private readonly config: ProviderConfig,
    private readonly settings: ISettingsRepository,
    private readonly logger: ILogger,
  ) {}

  protected abstract pickKey(settings: UserSettings): string | null;

  async generate(
    transcript: Transcript,
    videoType: VideoType,
    screenshots: Screenshot[] = [],
    options: SummaryOptions = { language: 'ru' },
  ): Promise<Summary> {
    const apiKey = this.pickKey(await this.settings.get());
    if (!apiKey) throw new MissingApiKeyError(this.config.keyName);

    const client = new OpenAI({
      apiKey,
      ...(this.config.baseURL ? { baseURL: this.config.baseURL } : {}),
      dangerouslyAllowBrowser: true,
      maxRetries: 6, // SDK соблюдает retry-after при 429
      timeout: 180_000,
    });

    const complete = async (prompt: ChatPrompt): Promise<string> => {
      const response = await client.chat.completions.create({
        model: this.config.model,
        temperature: 0.3,
        max_tokens: this.config.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      });
      return response.choices[0]?.message.content ?? '';
    };

    try {
      const raw = await summarizeTranscript(complete, {
        segments: transcript.segments.map((s) => ({ start: s.start.seconds, text: s.text })),
        videoType,
        language: options.language,
        maxCharsPerRequest: this.config.maxCharsPerRequest,
        screenshotTimestamps: screenshots.map((s) => s.timestamp.seconds),
        ...(options.title ? { title: options.title } : {}),
        onProgress: (done, total) =>
          options.onProgress?.({
            progress: Math.round((done / total) * 100),
            stage: total > 1 ? `Пишем конспект: часть ${Math.min(done + 1, total)} из ${total}…` : 'Пишем конспект…',
          }),
      });
      return {
        shortResume: raw.shortResume,
        detailedNotes: raw.detailedNotes,
        keyPoints: raw.keyPoints.map((k) => ({ text: k.text, timestamp: Timestamp.of(k.timestamp) })),
        quotes: raw.quotes.map((q) => ({ text: q.text, timestamp: Timestamp.of(q.timestamp) })),
        videoType,
        provider: this.config.provider,
      };
    } catch (error) {
      this.logger.error('llm request failed', { provider: this.config.provider, error: String(error) });
      if (error instanceof OpenAI.AuthenticationError) throw new InvalidApiKeyError(this.config.keyName);
      if (error instanceof OpenAI.RateLimitError) {
        throw new SummarizationError(
          this.config.keyName === 'groq'
            ? 'Достигнут бесплатный лимит Groq. Подождите минуту и нажмите «Повторить».'
            : 'OpenAI: превышен лимит или закончился баланс.',
          'RATE_LIMITED',
        );
      }
      if (error instanceof OpenAI.APIConnectionError) {
        throw new SummarizationError('Нет соединения с сервисом ИИ. Проверьте интернет и попробуйте снова.');
      }
      throw new SummarizationError(`Не удалось создать конспект: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
