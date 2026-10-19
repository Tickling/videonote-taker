import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import { AppError } from '../../domain/errors.js';
import type { ILogger, ISpeechToText } from '../../domain/ports.js';
import type { Segment } from '../../domain/types.js';
import type { FfmpegAudio } from '../adapters/FfmpegAudio.js';
import { toSegments } from './whisperFilter.js';

/** OpenAI Whisper API; длинные файлы (> 24 МБ) режутся на части. */
export class WhisperProvider implements ISpeechToText {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly ffmpeg: FfmpegAudio,
    private readonly logger: ILogger,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 4, timeout: 10 * 60 * 1000, ...(baseURL ? { baseURL } : {}) });
  }

  async transcribe(audioPath: string, language: string, onProgress?: (done: number, total: number) => void): Promise<Segment[]> {
    const parts = await this.ffmpeg.splitForWhisper(audioPath);
    const segments: Segment[] = [];
    for (const [index, part] of parts.entries()) {
      onProgress?.(index, parts.length);
      try {
        const response = await this.client.audio.transcriptions.create({
          file: createReadStream(part.path),
          model: 'whisper-1',
          language,
          response_format: 'verbose_json',
        });
        segments.push(...toSegments(response.segments ?? [], part.offset, segments.length));
      } catch (error) {
        throw mapOpenAiError(error);
      }
      this.logger.info({ part: index + 1, of: parts.length }, 'whisper part done');
    }
    onProgress?.(parts.length, parts.length);
    return segments;
  }
}

export function mapOpenAiError(error: unknown): AppError {
  if (error instanceof OpenAI.AuthenticationError) return new AppError('INVALID_API_KEY', 'Ключ OpenAI не подошёл. Проверьте его в настройках ⚙️.');
  if (error instanceof OpenAI.RateLimitError) return new AppError('RATE_LIMITED', 'Превышен лимит OpenAI или закончился баланс.');
  if (error instanceof OpenAI.APIConnectionError) return new AppError('TRANSCRIPTION_FAILED', 'Нет связи с OpenAI. Проверьте интернет на сервере.');
  return new AppError('TRANSCRIPTION_FAILED', 'Whisper не смог распознать аудио', error instanceof Error ? error.message : String(error));
}
