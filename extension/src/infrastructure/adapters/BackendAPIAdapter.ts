import type { Segment } from '@domain/entities/Segment';
import { DomainError } from '@domain/errors';
import type {
  BackendHealth,
  IBackendClient,
  JobSegmentDto,
  JobStatus,
  TranscribeByUrlOptions,
} from '@domain/ports/IBackendClient';
import type { ILogger } from '@domain/ports/ILogger';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import type { VideoType } from '@domain/valueObjects/VideoType';

export class BackendUnavailableError extends DomainError {
  constructor(baseUrl: string) {
    super(
      /localhost|127\.0\.0\.1/.test(baseUrl)
        ? `Сервер VideoNote не отвечает (${baseUrl}). Запустите его: двойной клик по start-backend в папке программы. Адрес сервера можно поменять в настройках ⚙️.`
        : `Сервер VideoNote (${baseUrl}) сейчас недоступен — попробуйте через несколько минут. Видео YouTube работают и без сервера.`,
      'BACKEND_UNAVAILABLE',
    );
  }
}

export class BackendRequestError extends DomainError {
  constructor(
    message: string,
    readonly backendCode: string,
    readonly status: number,
  ) {
    super(message, 'TRANSCRIPTION_FAILED');
  }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function segmentFromDto(dto: JobSegmentDto): Segment {
  return {
    id: dto.id,
    text: dto.text,
    start: Timestamp.of(dto.start),
    end: Timestamp.of(dto.end),
    confidence: dto.confidence,
  };
}

/** HTTP-клиент backend-а. Ключи уходят только в заголовках и только когда backend сам ходит к провайдеру. */
export class BackendAPIAdapter implements IBackendClient {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly logger: ILogger,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly retryDelayMs = 1000,
  ) {}

  async transcribeByUrl(
    url: string,
    language: string,
    videoType: VideoType,
    options: TranscribeByUrlOptions = {},
  ): Promise<{ jobId: string; estimatedTime?: number }> {
    const settings = await this.settings.get();
    const mode = options.mode ?? 'subtitles';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (mode === 'whisper' && settings.openaiApiKey) headers['X-OpenAI-Api-Key'] = settings.openaiApiKey;
    if (options.generateSummary) {
      if (settings.groqApiKey) headers['X-Groq-Api-Key'] = settings.groqApiKey;
      if (settings.openaiApiKey) headers['X-OpenAI-Api-Key'] = settings.openaiApiKey;
      headers['X-Summary-Provider'] = settings.summaryProvider;
    }
    return this.request<{ jobId: string; estimatedTime?: number }>('/api/transcribe-by-url', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        videoUrl: url,
        language,
        videoType,
        generateSummary: options.generateSummary ?? false,
        transcriptionMode: mode,
      }),
    });
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
  }

  async transcribeChunk(audioBlob: Blob, timestamp: number, language = 'ru'): Promise<Segment[]> {
    const params = new URLSearchParams({ start: String(timestamp), language, mode: 'local_whisper' });
    const result = await this.request<{ segments: JobSegmentDto[] }>(`/api/transcribe-chunk?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
    });
    return result.segments.map(segmentFromDto);
  }

  async health(): Promise<BackendHealth> {
    return this.request<BackendHealth>('/api/health', { method: 'GET' }, 1, 4000);
  }

  private async request<T>(path: string, init: RequestInit, attempts = 3, timeoutMs = 30000): Promise<T> {
    const { backendUrl } = await this.settings.get();
    const url = `${backendUrl.replace(/\/+$/, '')}${path}`;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        lastError = error;
        this.logger.warn('backend request failed', { path, attempt, error: String(error) });
        if (attempt < attempts) await this.delay(attempt);
        continue;
      }

      if (response.ok) return (await response.json()) as T;

      const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const code = body?.error?.code ?? `HTTP_${response.status}`;
      const message = body?.error?.message ?? `Сервер вернул ошибку ${response.status}`;
      if (RETRYABLE_STATUS.has(response.status) && attempt < attempts) {
        this.logger.warn('backend retryable status', { path, attempt, status: response.status });
        await this.delay(attempt);
        continue;
      }
      throw new BackendRequestError(message, code, response.status);
    }
    this.logger.error('backend unavailable', { url, error: String(lastError) });
    throw new BackendUnavailableError(backendUrl);
  }

  private delay(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
  }
}
