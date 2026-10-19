import { NoteNotFoundError, SummarizationError, DomainError } from '@domain/errors';
import type { VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { ILogger } from '@domain/ports/ILogger';
import type { ProgressListener } from '@domain/ports/ITranscriptionService';
import type { VideoType } from '@domain/valueObjects/VideoType';
import type { SummaryServiceFactory } from '../services/SummaryServiceFactory';

export interface GenerateSummaryCommand {
  noteId: string;
  videoType?: VideoType;
  language?: string;
  onProgress?: ProgressListener;
}

export class GenerateSummaryUseCase {
  constructor(
    private readonly factory: SummaryServiceFactory,
    private readonly notes: INoteRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(command: GenerateSummaryCommand): Promise<VideoNote> {
    const note = await this.notes.findById(command.noteId);
    if (!note) throw new NoteNotFoundError(command.noteId);
    if (note.transcript.segments.length === 0) {
      throw new SummarizationError('Сначала нужен транскрипт: он пока пуст.');
    }
    const videoType = command.videoType ?? note.videoType;
    const language = command.language ?? note.language;
    const { service, provider } = await this.factory.getService();

    command.onProgress?.({ progress: 0, stage: 'Пишем конспект…' });
    try {
      const summary = await service.generate(note.transcript, videoType, note.screenshots, {
        language,
        title: note.title,
        ...(command.onProgress ? { onProgress: command.onProgress } : {}),
      });
      // Перечитываем: пока шла генерация, могли добавиться скриншоты
      const fresh = (await this.notes.findById(note.id)) ?? note;
      const updated: VideoNote = {
        ...fresh,
        videoType,
        language,
        summary: { ...summary, videoType, provider, createdAt: new Date() },
        updatedAt: new Date(),
      };
      await this.notes.save(updated);
      this.logger.info('summary generated', { note: note.id, provider, videoType });
      return updated;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.error('summary failed', { note: note.id, error: String(error) });
      throw new SummarizationError(
        `Не удалось создать конспект: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
