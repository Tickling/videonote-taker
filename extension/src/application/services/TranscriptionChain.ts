import { SubtitlesNotFoundError, TranscriptionError } from '@domain/errors';
import { TranscriptionProvider } from '@domain/valueObjects/Providers';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import type {
  ITranscriptionService,
  TranscriptionInput,
  TranscriptionResult,
} from '@domain/ports/ITranscriptionService';
import type { ILogger } from '@domain/ports/ILogger';

/**
 * Цепочка обязанностей: автосубтитры (бесплатно) → Whisper (OpenAI или локальный,
 * если включён в настройках) → понятная ошибка.
 */
export class TranscriptionChain implements ITranscriptionService {
  constructor(
    private readonly subtitlesAdapter: ITranscriptionService,
    private readonly whisperAdapter: ITranscriptionService,
    private readonly localWhisperAdapter: ITranscriptionService,
    private readonly settings: ISettingsRepository,
    private readonly logger: ILogger,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const settings = await this.settings.get();

    // Real-time аудио: субтитров у фрагмента нет — сразу к Whisper
    if (input.audioBlob) {
      return this.transcribeWithWhisper(input, settings.transcriptionProvider, settings.openaiApiKey);
    }

    // 1. Всегда пробуем субтитры первым делом (бесплатно)
    let subtitlesError: unknown = null;
    try {
      const transcript = await this.subtitlesAdapter.transcribe(input);
      if (transcript.segments.length > 0) return { ...transcript, source: 'subtitles' };
    } catch (error) {
      subtitlesError = error;
      // Ошибки, не связанные с отсутствием субтитров (приватное видео, сервер выключен) — сразу наружу
      if (!(error instanceof SubtitlesNotFoundError)) throw error;
      this.logger.info('subtitles not found, trying fallback', {
        provider: settings.transcriptionProvider,
      });
    }

    // 2. Фоллбэк: Whisper, если пользователь его включил
    if (settings.transcriptionProvider !== TranscriptionProvider.SUBTITLES) {
      return this.transcribeWithWhisper(input, settings.transcriptionProvider, settings.openaiApiKey);
    }

    // 3. Иначе — ошибка с понятным сообщением
    throw subtitlesError instanceof SubtitlesNotFoundError ? subtitlesError : new SubtitlesNotFoundError();
  }

  private async transcribeWithWhisper(
    input: TranscriptionInput,
    provider: TranscriptionProvider,
    openaiApiKey: string | null,
  ): Promise<TranscriptionResult> {
    if (provider === TranscriptionProvider.LOCAL_WHISPER) {
      const transcript = await this.localWhisperAdapter.transcribe(input);
      return { ...transcript, source: 'local_whisper' };
    }
    if (provider === TranscriptionProvider.OPENAI_WHISPER && openaiApiKey) {
      const transcript = await this.whisperAdapter.transcribe(input);
      return { ...transcript, source: 'whisper' };
    }
    if (input.audioBlob) {
      throw new TranscriptionError(
        'Для записи в реальном времени нужен Whisper: включите его и добавьте OpenAI API-ключ в настройках ⚙️ (или настройте локальный Whisper).',
        'MISSING_API_KEY',
      );
    }
    throw new SubtitlesNotFoundError();
  }
}
