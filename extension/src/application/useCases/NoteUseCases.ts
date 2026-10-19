import { NoteNotFoundError } from '@domain/errors';
import type { VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import type { VideoType } from '@domain/valueObjects/VideoType';

export class SaveNoteUseCase {
  constructor(private readonly notes: INoteRepository) {}

  async execute(note: VideoNote): Promise<VideoNote> {
    const updated: VideoNote = { ...note, title: note.title.trim() || note.videoUrl.getCanonicalUrl(), updatedAt: new Date() };
    await this.notes.save(updated);
    return updated;
  }

  async updateScreenshotComment(noteId: string, screenshotId: string, comment: string): Promise<VideoNote> {
    const note = await this.require(noteId);
    return this.execute({
      ...note,
      screenshots: note.screenshots.map((s) =>
        s.id === screenshotId ? { ...s, comment: comment.trim() || null } : s,
      ),
    });
  }

  async deleteScreenshot(noteId: string, screenshotId: string): Promise<VideoNote> {
    const note = await this.require(noteId);
    return this.execute({ ...note, screenshots: note.screenshots.filter((s) => s.id !== screenshotId) });
  }

  private async require(id: string): Promise<VideoNote> {
    const note = await this.notes.findById(id);
    if (!note) throw new NoteNotFoundError(id);
    return note;
  }
}

export interface NoteFilter {
  query?: string;
  platform?: VideoPlatform | null;
  videoType?: VideoType | null;
}

export class ListNotesUseCase {
  constructor(private readonly notes: INoteRepository) {}

  async execute(filter: NoteFilter = {}): Promise<VideoNote[]> {
    const query = filter.query?.trim().toLowerCase() ?? '';
    const all = await this.notes.findAll();
    return all
      .filter((n) => !filter.platform || n.platform === filter.platform)
      .filter((n) => !filter.videoType || n.videoType === filter.videoType)
      .filter(
        (n) =>
          !query ||
          n.title.toLowerCase().includes(query) ||
          (n.summary?.shortResume.toLowerCase().includes(query) ?? false),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

export class DeleteNoteUseCase {
  constructor(private readonly notes: INoteRepository) {}

  async execute(id: string): Promise<void> {
    await this.notes.delete(id);
  }
}
