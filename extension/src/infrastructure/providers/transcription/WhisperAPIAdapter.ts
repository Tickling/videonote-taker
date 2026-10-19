import OpenAI from 'openai';
import { InvalidApiKeyError, MissingApiKeyError, TranscriptionError } from '@domain/errors';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import type { BackendJobTranscriber } from './BackendJobTranscriber';
import { whisperToSegments } from './whisperSegments';

/**
 * OpenAI Whisper (платно).
 * - real-time фрагменты: запрос из расширения напрямую в OpenAI (ключ не покидает браузер);
 * - ссылка на видео: аудио скачивает backend, ключ передаётся ему в заголовке.
 */
export class WhisperAPIAdapter implements ITranscriptionService {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly jobs: BackendJobTranscriber,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (input.audioBlob) return this.transcribeBlob(input.audioBlob, input.language, input.offsetSeconds ?? 0);
    return this.jobs.run(input, 'whisper');
  }

  private async transcribeBlob(blob: Blob, language: string, offset: number): Promise<TranscriptionResult> {
    const { openaiApiKey } = await this.settings.get();
    if (!openaiApiKey) throw new MissingApiKeyError('openai');
    const client = new OpenAI({ apiKey: openaiApiKey, dangerouslyAllowBrowser: true, maxRetries: 3, timeout: 120_000 });
    const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
    try {
      const response = await client.audio.transcriptions.create({
        file: new File([blob], `chunk.${extension}`, { type: blob.type || 'audio/webm' }),
        model: 'whisper-1',
        language,
        response_format: 'verbose_json',
      });
      const segments = whisperToSegments(response.segments ?? [], offset, `rt${Math.round(offset * 1000)}`);
      return {
        segments,
        totalDuration: offset + (response.duration ?? 0),
        source: 'whisper',
        language,
      };
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) throw new InvalidApiKeyError('openai');
      if (error instanceof OpenAI.RateLimitError) {
        throw new TranscriptionError('OpenAI: превышен лимит запросов или закончился баланс.', 'RATE_LIMITED');
      }
      throw new TranscriptionError(`Whisper не смог распознать аудио: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
