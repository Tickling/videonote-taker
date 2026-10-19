import type { VideoNote } from '../entities/VideoNote';

export interface IDocumentExporter {
  exportToWord(note: VideoNote): Promise<Blob>;
}

export interface IMarkdownExporter {
  exportToMarkdown(note: VideoNote): string;
}
