import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createVideoNote, type VideoNote } from '@domain/entities/VideoNote';
import { SummaryProvider } from '@domain/valueObjects/Providers';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { MarkdownExporter } from './MarkdownExporter';
import { WordExporter } from './WordExporter';

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const note: VideoNote = {
  ...createVideoNote({ videoUrl: new VideoUrl('https://youtu.be/dQw4w9WgXcQ'), title: 'Основы Python', videoType: VideoType.EDUCATIONAL, language: 'ru' }),
  transcript: { source: 'subtitles', totalDuration: 20, segments: [{ id: 's0', text: 'Привет, это урок', start: new Timestamp(0), end: new Timestamp(5), confidence: 1 }] },
  summary: {
    shortResume: 'Урок про **переменные**.',
    keyPoints: [{ text: 'Переменные', timestamp: new Timestamp(65) }],
    detailedNotes: '## [01:05] Переменные\n- **x** — имя\n1. шаг\n```\nx = 1\n```',
    quotes: [{ text: 'Код — это текст', timestamp: new Timestamp(10) }],
    videoType: VideoType.EDUCATIONAL,
    provider: SummaryProvider.GROQ,
  },
  screenshots: [{ id: 'p', imageData: PNG, timestamp: new Timestamp(12), comment: 'Схема', linkedSegmentId: null, width: 1, height: 1 }],
};

describe('MarkdownExporter', () => {
  it('renders all sections with timestamp links', () => {
    const md = new MarkdownExporter().exportToMarkdown(note);
    expect(md).toContain('# Основы Python');
    expect(md).toContain('- [01:05](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s) Переменные');
    expect(md).toContain('## [01:05](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s) Переменные');
    expect(md).toContain('> «Код — это текст»');
    expect(md).toContain('![Скриншот 00:12](data:image/png');
    expect(md).toContain('## Транскрипт');
  });
});

describe('WordExporter', () => {
  it('builds a valid docx with text, links and image', async () => {
    const blob = await new WordExporter().exportToWord(note);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('string');
    expect(xml).toContain('Основы Python');
    expect(xml).toContain('Ключевые моменты');
    expect(xml).toContain('Код — это текст');
    expect(xml).toContain('x = 1');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const rels = await zip.file('word/_rels/document.xml.rels')?.async('string');
    expect(rels).toContain('t=65s');
  });
});
