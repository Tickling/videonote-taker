import { createVideoNote, type VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { ILogger } from '@domain/ports/ILogger';
import type { ITranscriptionService, ProgressListener } from '@domain/ports/ITranscriptionService';
import type { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';

export interface TranscribeVideoCommand {
  url: string;
  language: string;
  videoType: VideoType;
  title?: string;
  onProgress?: ProgressListener;
}

/** Сценарий «по ссылке»: получить транскрипт и сохранить в заметку видео. */
export class TranscribeVideoUseCase {
  constructor(
    private readonly transcription: ITranscriptionService,
    private readonly notes: INoteRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(command: TranscribeVideoCommand): Promise<VideoNote> {
    const videoUrl = new VideoUrl(command.url);
    command.onProgress?.({ progress: 2, stage: 'Ищем субтитры…' });

    const result = await this.transcription.transcribe({
      videoUrl,
      language: command.language,
      ...(command.onProgress ? { onProgress: command.onProgress } : {}),
    });
    this.logger.info('transcribed', {
      video: videoUrl.getKey(),
      source: result.source,
      segments: result.segments.length,
    });

    const existing = await this.notes.findById(videoUrl.getKey());
    const { title: resultTitle, ...transcript } = result;
    const title = resultTitle?.trim() || command.title?.trim() || existing?.title;
    const now = new Date();
    const note: VideoNote = existing
      ? {
          ...existing,
          title: title || existing.title,
          videoType: command.videoType,
          language: command.language,
          transcript,
          updatedAt: now,
        }
      : createVideoNote({
          videoUrl,
          videoType: command.videoType,
          language: command.language,
          transcript,
          now,
          ...(title ? { title } : {}),
        });
    await this.notes.save(note);
    return note;
  }
}
