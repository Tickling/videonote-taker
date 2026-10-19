import OpenAI from 'openai';
import type { ChatPrompt } from '@shared/prompts.js';
import { summarizeTranscript } from '@shared/summarize.js';
import { summaryToMarkdown } from '@shared/summaryMarkdown.js';
import { GROQ_MODEL_PREFERENCE, isJsonModeUnsupported, isModelUnavailable, rankModels, reasoningParams } from '@shared/modelSelection.js';
import { AppError, SummarizationError } from '../../domain/errors.js';
import type { ILogger, ISummarizer, ISummarizerFactory } from '../../domain/ports.js';
import type { Credentials, ProgressReporter, SummaryProviderId, SummaryResult, Transcript, VideoTypeId } from '../../domain/types.js';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

interface LlmConfig {
  provider: SummaryProviderId;
  apiKey: string;
  baseURL?: string | undefined;
  models: readonly string[];
  discoverModels: boolean;
  maxCharsPerRequest: number;
  maxOutputTokens: number;
}

/** Groq (Llama 3.3) и OpenAI (GPT-4o) — один код, разный baseURL. */
export class LlmSummarizer implements ISummarizer {
  private readonly client: OpenAI;

  constructor(
    private readonly config: LlmConfig,
    private readonly logger: ILogger,
  ) {
    this.client = new OpenAI({ apiKey: config.apiKey, maxRetries: 6, timeout: 180_000, ...(config.baseURL ? { baseURL: config.baseURL } : {}) });
  }

  private async candidateModels(): Promise<string[]> {
    if (!this.config.discoverModels) return [...this.config.models];
    try {
      const page = await this.client.models.list();
      return rankModels(this.config.models, page.data.map((m) => m.id));
    } catch (error) {
      this.logger.warn({ err: String(error) }, 'models list failed, using defaults');
      return [...this.config.models];
    }
  }

  async summarize(transcript: Transcript, videoType: VideoTypeId, language: string, title: string | undefined, onProgress?: ProgressReporter): Promise<SummaryResult> {
    const candidates = await this.candidateModels();
    const unavailable = new Set<string>();
    const complete = async (prompt: ChatPrompt): Promise<string> => {
      let lastError: unknown = null;
      for (const model of candidates) {
        if (unavailable.has(model)) continue;
        for (const jsonMode of [true, false]) {
          const started = Date.now();
          try {
            const response = await this.client.chat.completions.create({
              model,
              temperature: 0.3,
              max_tokens: this.config.maxOutputTokens,
              ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
              ...reasoningParams(model),
              messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
              ],
            });
            this.logger.info({ provider: this.config.provider, model, ms: Date.now() - started, tokens: response.usage?.total_tokens }, 'llm call');
            return response.choices[0]?.message.content ?? '';
          } catch (error) {
            lastError = error;
            const status = error instanceof OpenAI.APIError ? error.status : undefined;
            const message = error instanceof Error ? error.message : String(error);
            if (jsonMode && isJsonModeUnsupported(status, message)) continue;
            if (isModelUnavailable(status, message)) {
              this.logger.warn({ model, status }, 'model unavailable, trying next');
              unavailable.add(model);
              break;
            }
            throw error;
          }
        }
      }
      throw lastError ?? new Error('Нет доступных моделей');
    };

    try {
      const raw = await summarizeTranscript(complete, {
        segments: transcript.segments.map((s) => ({ start: s.start, text: s.text })),
        videoType,
        language,
        maxCharsPerRequest: this.config.maxCharsPerRequest,
        ...(title ? { title } : {}),
        onProgress: (done, total) => onProgress?.(Math.round((done / total) * 100), total > 1 ? `Пишем конспект: ${done} из ${total}…` : 'Пишем конспект…'),
      });
      return { ...raw, markdown: summaryToMarkdown(raw, videoType, title), videoType, provider: this.config.provider };
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        throw new SummarizationError(`Ключ ${this.config.provider === 'groq' ? 'Groq' : 'OpenAI'} не подошёл.`, 'INVALID_API_KEY');
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new SummarizationError('Превышен лимит запросов к ИИ. Подождите минуту и повторите.', 'RATE_LIMITED');
      }
      if (error instanceof AppError) throw error;
      throw new SummarizationError(`Не удалось создать конспект: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export class SummarizerFactory implements ISummarizerFactory {
  constructor(
    private readonly logger: ILogger,
    /** Ключ Groq владельца сервера — используется, если пользователь не прислал свой */
    private readonly defaultGroqKey: string | null,
    private readonly baseUrls: { groq?: string | undefined; openai?: string | undefined } = {},
  ) {}

  create(credentials: Credentials): ISummarizer | null {
    if (credentials.summaryProvider === 'gpt4o' && credentials.openaiApiKey) {
      return new LlmSummarizer(
        { provider: 'gpt4o', apiKey: credentials.openaiApiKey, baseURL: this.baseUrls.openai, models: ['gpt-4o'], discoverModels: false, maxCharsPerRequest: 80_000, maxOutputTokens: 6_000 },
        this.logger,
      );
    }
    const groqKey = credentials.groqApiKey ?? this.defaultGroqKey;
    if (!groqKey) return null;
    return new LlmSummarizer(
      { provider: 'groq', apiKey: groqKey, baseURL: this.baseUrls.groq ?? GROQ_BASE_URL, models: GROQ_MODEL_PREFERENCE, discoverModels: true, maxCharsPerRequest: 10_000, maxOutputTokens: 3_500 },
      this.logger,
    );
  }
}
