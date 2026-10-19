import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import { TranscriptionError } from '@domain/errors';
import type { BackendJobTranscriber } from './BackendJobTranscriber';

/** Бесплатно: автосубтитры через backend (yt-dlp --write-auto-sub --skip-download). */
export class SubtitlesExtractorAdapter implements ITranscriptionService {
  constructor(private readonly jobs: BackendJobTranscriber) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!input.videoUrl) throw new TranscriptionError('Субтитры доступны только для ссылки на видео');
    return this.jobs.run(input, 'subtitles');
  }
}
