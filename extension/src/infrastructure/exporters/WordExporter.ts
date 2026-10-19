import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from 'docx';
import type { VideoNote } from '@domain/entities/VideoNote';
import type { IDocumentExporter } from '@domain/ports/IDocumentExporter';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { PLATFORM_LABELS, SUMMARY_PROVIDER_LABELS, TRANSCRIPT_SOURCE_LABELS, VIDEO_TYPE_LABELS } from './labels';
import { summarySections, type SummarySection } from './summaryView';

const MAX_IMAGE_WIDTH = 600; // px в документе

function timeLink(note: VideoNote, t: Timestamp): ExternalHyperlink {
  return new ExternalHyperlink({
    link: note.videoUrl.getTimestampUrl(t),
    children: [new TextRun({ text: `[${t.format()}]`, style: 'Hyperlink', bold: true })],
  });
}

/** Inline-разметка: **жирный**, *курсив*, `код`, [ММ:СС] → ссылка. */
export function inlineRuns(text: string, note: VideoNote): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\d{1,2}(?::\d{2}){1,2}\])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > last) runs.push(new TextRun(text.slice(last, index)));
    if (token.startsWith('**')) runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    else if (token.startsWith('`')) runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas' }));
    else if (token.startsWith('[')) {
      try {
        runs.push(timeLink(note, Timestamp.parse(token.slice(1, -1))));
      } catch {
        runs.push(new TextRun(token));
      }
    } else runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    last = index + token.length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs;
}

/** Упрощённый Markdown → абзацы docx (заголовки, списки, цитаты, код). */
export function markdownToParagraphs(markdown: string, note: VideoNote): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let inCode = false;
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 20 })] }));
      continue;
    }
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      paragraphs.push(
        new Paragraph({
          heading: level <= 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4,
          children: inlineRuns(heading[2] ?? '', note),
        }),
      );
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      const level = Math.min(3, Math.floor((bullet[1] ?? '').length / 2));
      paragraphs.push(new Paragraph({ bullet: { level }, children: inlineRuns(bullet[2] ?? '', note) }));
      continue;
    }
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      paragraphs.push(
        new Paragraph({
          indent: { left: 360 },
          children: [new TextRun(`${numbered[2]}. `), ...inlineRuns(numbered[3] ?? '', note)],
        }),
      );
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      paragraphs.push(
        new Paragraph({
          indent: { left: 480 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'F97316', space: 8 } },
          children: inlineRuns(quote[1] ?? '', note),
        }),
      );
      continue;
    }
    paragraphs.push(new Paragraph({ children: inlineRuns(line.trim(), note) }));
  }
  return paragraphs;
}

function base64ToBytes(dataUrl: string): { bytes: Uint8Array; type: 'jpg' | 'png' } | null {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
  if (!match?.[2]) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, type: match[1] === 'png' ? 'png' : 'jpg' };
}

function bullet(children: ParagraphChild[]): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, children });
}

export class WordExporter implements IDocumentExporter {
  private section(section: SummarySection, note: VideoNote): Paragraph[] {
    const at = (seconds: number): ExternalHyperlink => timeLink(note, Timestamp.of(seconds));
    switch (section.kind) {
      case 'text':
        return [new Paragraph({ children: inlineRuns(section.text, note) })];
      case 'markdown':
        return markdownToParagraphs(section.text, note);
      case 'list':
        return section.items.map((i) => bullet(inlineRuns(i, note)));
      case 'timecodes':
        return section.items.map((i) => new Paragraph({ spacing: { after: 40 }, children: [at(i.timestamp), new TextRun(` — ${i.text}`)] }));
      case 'quotes':
        return section.items.map(
          (q) => new Paragraph({ indent: { left: 480 }, spacing: { after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'F97316', space: 8 } }, children: [new TextRun({ text: `«${q.text}» `, italics: true }), at(q.timestamp)] }),
        );
      case 'characters':
        return section.items.map((c) => bullet([new TextRun({ text: c.name, bold: true }), new TextRun(c.role ? ` — ${c.role}` : '')]));
      case 'reading':
        return section.items.map((r) => bullet([new TextRun({ text: r.title, bold: true }), new TextRun(r.why ? ` — ${r.why}` : '')]));
      case 'rating':
        return [
          new Paragraph({ children: [new TextRun({ text: `${section.score} / 10`, bold: true, size: 32, color: 'EA580C' })] }),
          ...(section.comment ? [new Paragraph({ children: inlineRuns(section.comment, note) })] : []),
        ];
    }
  }

  async exportToWord(note: VideoNote): Promise<Blob> {
    const children: Paragraph[] = [];
    const h = (text: string): Paragraph => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun(text)] });

    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(note.title)] }));
    const type = VIDEO_TYPE_LABELS[note.videoType];
    const meta: Array<[string, ParagraphChild]> = [
      ['Видео: ', new ExternalHyperlink({ link: note.videoUrl.getCanonicalUrl(), children: [new TextRun({ text: note.videoUrl.getCanonicalUrl(), style: 'Hyperlink' })] })],
      ['Платформа: ', new TextRun(PLATFORM_LABELS[note.platform])],
      ['Тип: ', new TextRun(`${type.emoji} ${type.label}`)],
      ['Дата: ', new TextRun(note.updatedAt.toLocaleString('ru-RU'))],
      ['Транскрипт: ', new TextRun(TRANSCRIPT_SOURCE_LABELS[note.transcript.source])],
    ];
    if (note.summary) meta.push(['Конспект: ', new TextRun(SUMMARY_PROVIDER_LABELS[note.summary.provider])]);
    for (const [label, value] of meta) {
      children.push(new Paragraph({ children: [new TextRun({ text: label, bold: true, color: '64748B' }), value] }));
    }

    if (note.summary) {
      for (const section of summarySections(note.summary)) {
        children.push(h(section.title), ...this.section(section, note));
      }
    }

    if (note.screenshots.length) {
      children.push(h('Скриншоты'));
      for (const shot of note.screenshots) {
        const image = base64ToBytes(shot.imageData);
        if (image) {
          const w = shot.width ?? 1280;
          const ht = shot.height ?? 720;
          const scale = Math.min(1, MAX_IMAGE_WIDTH / w);
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: image.type, data: image.bytes, transformation: { width: Math.round(w * scale), height: Math.round(ht * scale) } })],
            }),
          );
        }
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [timeLink(note, shot.timestamp), new TextRun({ text: shot.comment ? ` ${shot.comment}` : '', italics: true })],
          }),
        );
      }
    }

    const doc = new Document({
      creator: 'VideoNote Taker',
      title: note.title,
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      sections: [{ children }],
    });
    return Packer.toBlob(doc);
  }
}
