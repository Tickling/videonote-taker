import type { VideoNote } from '@domain/entities/VideoNote';
import type { IMarkdownExporter } from '@domain/ports/IDocumentExporter';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { PLATFORM_LABELS, SUMMARY_PROVIDER_LABELS, TRANSCRIPT_SOURCE_LABELS, VIDEO_TYPE_LABELS } from './labels';

/** Заменяет [ММ:СС] в тексте на ссылки на момент видео. */
export function linkTimecodes(text: string, note: VideoNote): string {
  return text.replace(/\[(\d{1,2}(?::\d{2}){1,2})\](?!\()/g, (match, code: string) => {
    try {
      return `[${code}](${note.videoUrl.getTimestampUrl(Timestamp.parse(code))})`;
    } catch {
      return match;
    }
  });
}

export class MarkdownExporter implements IMarkdownExporter {
  exportToMarkdown(note: VideoNote): string {
    const link = (t: Timestamp): string => `[${t.format()}](${note.videoUrl.getTimestampUrl(t)})`;
    const type = VIDEO_TYPE_LABELS[note.videoType];
    const out: string[] = [
      `# ${note.title}`,
      '',
      `- **Видео:** ${note.videoUrl.getCanonicalUrl()}`,
      `- **Платформа:** ${PLATFORM_LABELS[note.platform]}`,
      `- **Тип:** ${type.emoji} ${type.label}`,
      `- **Дата:** ${note.updatedAt.toLocaleString('ru-RU')}`,
      `- **Транскрипт:** ${TRANSCRIPT_SOURCE_LABELS[note.transcript.source]}`,
    ];
    if (note.summary) out.push(`- **Конспект:** ${SUMMARY_PROVIDER_LABELS[note.summary.provider]}`);
    out.push('');

    const s = note.summary;
    if (s) {
      if (s.shortResume) out.push('## Кратко', '', s.shortResume, '');
      if (s.keyPoints.length) {
        out.push('## Ключевые моменты', '', ...s.keyPoints.map((k) => `- ${link(k.timestamp)} ${k.text}`), '');
      }
      if (s.detailedNotes) out.push('## Подробный конспект', '', linkTimecodes(s.detailedNotes, note), '');
      if (s.quotes.length) {
        out.push('## Цитаты', '');
        for (const q of s.quotes) out.push(`> «${q.text}» — ${link(q.timestamp)}`, '');
      }
    }

    if (note.screenshots.length) {
      out.push('## Скриншоты', '');
      for (const shot of note.screenshots) {
        out.push(`### ${link(shot.timestamp)}${shot.comment ? ` — ${shot.comment}` : ''}`, '', `![Скриншот ${shot.timestamp.format()}](${shot.imageData})`, '');
      }
    }

    if (note.transcript.segments.length) {
      out.push('## Транскрипт', '');
      for (const seg of note.transcript.segments) out.push(`${link(seg.start)} ${seg.text}  `);
      out.push('');
    }
    return out.join('\n');
  }
}
