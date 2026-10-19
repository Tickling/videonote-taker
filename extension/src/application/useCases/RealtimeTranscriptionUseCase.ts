import { appendSegments } from '@domain/entities/Transcript';
import { createVideoNote, type VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { ILogger } from '@domain/ports/ILogger';
import type { ITranscriptionService } from '@domain/ports/ITranscriptionService';
import type { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';

export interface RealtimeChunkCommand {
  pageUrl: string;
  title: string;
  audioBlob: Blob;
  /** Позиция видео (сек) в начале фрагмента */
  videoTime: number;
  language: string;
  videoType: VideoType;
}

/** Real-time: аудио-фрагмент → Whisper → сегменты дописываются в заметку видео. */
export class RealtimeTranscriptionUseCase {
  constructor(
    private readonly transcription: ITranscriptionService,
    private readonly notes: INoteRepository,
    private readonly logger: ILogger,
  ) {}

  async appendChunk(command: RealtimeChunkCommand): Promise<VideoNote> {
    const videoUrl = new VideoUrl(command.pageUrl);
    const result = await this.transcription.transcribe({
      audioBlob: command.audioBlob,
      offsetSeconds: command.videoTime,
      language: command.language,
    });

    const existing = await this.notes.findById(videoUrl.getKey());
    const note =
      existing ??
      createVideoNote({
        videoUrl,
        title: command.title,
        videoType: command.videoType,
        language: command.language,
        transcript: { segments: [], totalDuration: 0, source: result.source },
      });

    // Не дублируем сегменты, если этот участок уже расшифрован
    const fresh = result.segments.filter(
      (segment) =>
        !note.transcript.segments.some(
          (s) => Math.abs(s.start.seconds - segment.start.seconds) < 1 && s.text === segment.text,
        ),
    );
    const updated: VideoNote = {
      ...note,
      transcript: appendSegments({ ...note.transcript, source: result.source }, fresh),
      updatedAt: new Date(),
    };
    await this.notes.save(updated);
    this.logger.info('realtime chunk', { note: note.id, at: command.videoTime, segments: fresh.length });
    return updated;
  }
}
