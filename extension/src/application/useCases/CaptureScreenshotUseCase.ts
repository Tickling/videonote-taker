import { DomainError } from '@domain/errors';
import type { Screenshot } from '@domain/entities/Screenshot';
import { findSegmentAt } from '@domain/entities/Transcript';
import { createVideoNote, type VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { CapturedImage, IScreenshotService } from '@domain/ports/IScreenshotService';
import type { ILogger } from '@domain/ports/ILogger';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import type { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';

export interface CaptureScreenshotCommand {
  pageUrl: string;
  title: string;
  video: HTMLVideoElement | null;
  defaultVideoType: VideoType;
  defaultLanguage: string;
  comment?: string;
}

export class CaptureScreenshotUseCase {
  constructor(
    private readonly screenshots: IScreenshotService,
    private readonly notes: INoteRepository,
    private readonly logger: ILogger,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(command: CaptureScreenshotCommand): Promise<{ note: VideoNote; screenshot: Screenshot }> {
    const videoUrl = new VideoUrl(command.pageUrl);
    const time = Timestamp.of(command.video?.currentTime ?? 0);

    const image = await this.capture(command.video);

    const existing = await this.notes.findById(videoUrl.getKey());
    const note =
      existing ??
      createVideoNote({
        videoUrl,
        title: command.title,
        videoType: command.defaultVideoType,
        language: command.defaultLanguage,
      });

    const screenshot: Screenshot = {
      id: this.newId(),
      imageData: image.imageData,
      width: image.width,
      height: image.height,
      timestamp: time,
      comment: command.comment?.trim() || null,
      linkedSegmentId: findSegmentAt(note.transcript, time)?.id ?? null,
    };
    const updated: VideoNote = {
      ...note,
      screenshots: [...note.screenshots, screenshot].sort(
        (a, b) => a.timestamp.seconds - b.timestamp.seconds,
      ),
      updatedAt: new Date(),
    };
    await this.notes.save(updated);
    this.logger.info('screenshot captured', { note: note.id, at: time.format() });
    return { note: updated, screenshot };
  }

  private async capture(video: HTMLVideoElement | null): Promise<CapturedImage> {
    if (video) {
      try {
        return await this.screenshots.captureFromVideo(video);
      } catch (error) {
        // Кадр защищён (cross-origin/DRM) — снимаем видимую область вкладки
        this.logger.warn('video frame capture failed, falling back to tab capture', {
          error: String(error),
        });
      }
    }
    try {
      return await this.screenshots.captureVisibleTab();
    } catch (error) {
      throw new DomainError(
        `Не удалось сделать скриншот: ${error instanceof Error ? error.message : String(error)}`,
        'SCREENSHOT_FAILED',
      );
    }
  }
}
