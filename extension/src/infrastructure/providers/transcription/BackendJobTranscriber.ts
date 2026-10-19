import { DomainError, SubtitlesNotFoundError, TranscriptionError } from '@domain/errors';
import type { IBackendClient, JobStatus, TranscriptionMode } from '@domain/ports/IBackendClient';
import type { ILogger } from '@domain/ports/ILogger';
import type { TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoType } from '@domain/valueObjects/VideoType';
import { segmentFromDto } from '../../adapters/BackendAPIAdapter';

const DEFAULT_STAGE: Record<JobStatus['status'], string> = {
  queued: 'В очереди…',
  processing: 'Обработка…',
  completed: 'Готово',
  failed: 'Ошибка',
};

/** Запускает job на backend и опрашивает статус до завершения. */
export class BackendJobTranscriber {
  constructor(
    private readonly backend: IBackendClient,
    private readonly logger: ILogger,
    private readonly pollIntervalMs = 1500,
    private readonly maxWaitMs = 3 * 60 * 60 * 1000,
    /** false — видео YouTube на сервер не отправляются (сборка для Chrome Web Store) */
    private readonly allowYouTube = true,
  ) {}

  async run(input: TranscriptionInput, mode: TranscriptionMode): Promise<TranscriptionResult> {
    if (!input.videoUrl) throw new TranscriptionError('Не указана ссылка на видео');
    if (!this.allowYouTube && input.videoUrl.getPlatform() === VideoPlatform.YOUTUBE) {
      throw new TranscriptionError(
        mode === 'subtitles'
          ? 'Не удалось получить субтитры YouTube. Обновите страницу видео (F5) и попробуйте снова.'
          : 'У этого видео YouTube нет субтитров. Включите «Запись в реальном времени» (нужен Whisper в настройках ⚙️) и запустите видео.',
      );
    }
    const { jobId } = await this.backend.transcribeByUrl(
      input.videoUrl.getCanonicalUrl(),
      input.language,
      VideoType.EDUCATIONAL,
      { mode, generateSummary: false },
    );
    this.logger.info('job started', { jobId, mode });

    const deadline = Date.now() + this.maxWaitMs;
    let pollFailures = 0;
    while (Date.now() < deadline) {
      let status: JobStatus;
      try {
        status = await this.backend.getJobStatus(jobId);
        pollFailures = 0;
      } catch (error) {
        // Кратковременные сбои сети не должны убивать длинную задачу
        pollFailures += 1;
        if (pollFailures >= 5) throw error;
        await this.sleep();
        continue;
      }
      input.onProgress?.({ progress: status.progress, stage: status.stage ?? DEFAULT_STAGE[status.status] });

      if (status.status === 'completed' && status.result) {
        const { transcript, title } = status.result;
        return {
          segments: transcript.segments.map(segmentFromDto),
          totalDuration: transcript.totalDuration,
          source: transcript.source,
          ...(transcript.language ? { language: transcript.language } : {}),
          ...(title ? { title } : {}),
        };
      }
      if (status.status === 'failed') throw mapJobError(status.error);
      await this.sleep();
    }
    throw new TranscriptionError('Обработка видео заняла слишком много времени. Попробуйте ещё раз.');
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
  }
}

export function mapJobError(error: JobStatus['error']): DomainError {
  const message = error?.message ?? 'Не удалось обработать видео';
  switch (error?.code) {
    case 'SUBTITLES_NOT_FOUND':
      return new SubtitlesNotFoundError();
    case 'VIDEO_PRIVATE':
    case 'VIDEO_UNAVAILABLE':
      return new TranscriptionError(message, 'VIDEO_UNAVAILABLE');
    case 'MISSING_API_KEY':
      return new TranscriptionError(message, 'MISSING_API_KEY');
    case 'INVALID_API_KEY':
      return new TranscriptionError(message, 'INVALID_API_KEY');
    case 'RATE_LIMITED':
      return new TranscriptionError(message, 'RATE_LIMITED');
    default:
      return new TranscriptionError(message);
  }
}
