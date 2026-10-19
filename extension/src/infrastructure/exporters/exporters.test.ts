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

const base = createVideoNote({ videoUrl: new VideoUrl('https://youtu.be/dQw4w9WgXcQ'), title: 'Основы Python', videoType: VideoType.EDUCATIONAL, language: 'ru' });
const shot = { id: 'p', imageData: PNG, timestamp: new Timestamp(12), comment: 'Схема', linkedSegmentId: null, width: 1, height: 1 };
const transcript = { source: 'subtitles' as const, totalDuration: 20, segments: [{ id: 's0', text: 'Привет, это урок', start: new Timestamp(0), end: new Timestamp(5), confidence: 1 }] };

const educational: VideoNote = {
  ...base,
  transcript,
  summary: {
    shortResume: 'Урок про **переменные**.',
    keyPoints: [{ text: 'Переменные', timestamp: new Timestamp(65) }],
    detailedNotes: '',
    quotes: [],
    ideas: ['Переменная — это имя для значения'],
    furtherReading: [{ title: 'Изучаем Python, Марк Лутц', why: 'основы языка' }],
    example: '```python\nx = 1\n```',
    videoType: VideoType.EDUCATIONAL,
    provider: SummaryProvider.GROQ,
  },
  screenshots: [shot],
};

const interview: VideoNote = {
  ...base,
  title: 'Интервью',
  videoType: VideoType.INTERVIEW,
  transcript,
  summary: {
    shortResume: 'Беседа',
    keyPoints: [{ text: 'Начало', timestamp: new Timestamp(10) }],
    detailedNotes: '',
    quotes: [{ text: 'Код — это текст', timestamp: new Timestamp(30) }],
    ideas: ['Идея 1'],
    conclusions: ['Вывод 1'],
    videoType: VideoType.INTERVIEW,
    provider: SummaryProvider.GROQ,
  },
  screenshots: [],
};

describe('MarkdownExporter', () => {
  it('educational: ideas, about, timecodes, AI help; no transcript', () => {
    const md = new MarkdownExporter().exportToMarkdown(educational);
    expect(md).toContain('# Основы Python');
    const order = ['## Главные мысли и идеи', '## О чём видео', '## Таймкоды', '## Помощь от ИИ: что почитать по теме', '## Помощь от ИИ: пример', '## Скриншоты'];
    const positions = order.map((h) => md.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(md).toContain('- [01:05](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s) — Переменные');
    expect(md).toContain('![Скриншот 00:12](data:image/png');
    expect(md).not.toContain('Транскрипт\n');
    expect(md).not.toContain('Привет, это урок');
  });

  it('interview: ideas, quotes, conclusions, timecodes', () => {
    const md = new MarkdownExporter().exportToMarkdown(interview);
    const positions = ['## Основные идеи', '## Главные цитаты', '## Выводы', '## Таймкоды'].map((h) => md.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(md).toContain('> «Код — это текст» — [00:30]');
  });
});

describe('WordExporter', () => {
  it('builds a valid docx with the type layout, links and image, without transcript', async () => {
    const blob = await new WordExporter().exportToWord(educational);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('Основы Python');
    expect(xml).toContain('Главные мысли и идеи');
    expect(xml).toContain('Помощь от ИИ: что почитать по теме');
    expect(xml).toContain('Изучаем Python, Марк Лутц');
    expect(xml).toContain('x = 1');
    expect(xml).not.toContain('Привет, это урок');
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/') && !zip.files[f]?.dir)).toBe(true);
    const rels = await zip.file('word/_rels/document.xml.rels')?.async('string');
    expect(rels).toContain('t=65s');
  });

  it('interview docx contains quotes and conclusions', async () => {
    const zip = await JSZip.loadAsync(await (await new WordExporter().exportToWord(interview)).arrayBuffer());
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('Главные цитаты');
    expect(xml).toContain('Код — это текст');
    expect(xml).toContain('Выводы');
  });
});
