import { NoteNotFoundError } from '@domain/errors';
import type { IDocumentExporter, IMarkdownExporter } from '@domain/ports/IDocumentExporter';
import type { INoteRepository } from '@domain/ports/INoteRepository';

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

export function safeFilename(title: string, extension: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'konspekt'}.${extension}`;
}

export class ExportToWordUseCase {
  constructor(
    private readonly exporter: IDocumentExporter,
    private readonly notes: INoteRepository,
  ) {}

  async execute(noteId: string): Promise<ExportedFile> {
    const note = await this.notes.findById(noteId);
    if (!note) throw new NoteNotFoundError(noteId);
    return { blob: await this.exporter.exportToWord(note), filename: safeFilename(note.title, 'docx') };
  }
}

export class ExportToMarkdownUseCase {
  constructor(
    private readonly exporter: IMarkdownExporter,
    private readonly notes: INoteRepository,
  ) {}

  async execute(noteId: string): Promise<ExportedFile> {
    const note = await this.notes.findById(noteId);
    if (!note) throw new NoteNotFoundError(noteId);
    const markdown = this.exporter.exportToMarkdown(note);
    return {
      blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
      filename: safeFilename(note.title, 'md'),
    };
  }
}
