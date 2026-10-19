import type { VideoNote } from '@domain/entities/VideoNote';
import type { IMarkdownExporter } from '@domain/ports/IDocumentExporter';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { PLATFORM_LABELS, SUMMARY_PROVIDER_LABELS, TRANSCRIPT_SOURCE_LABELS, VIDEO_TYPE_LABELS } from './labels';
import { summarySections, type SummarySection } from './summaryView';

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

    if (note.summary) {
      for (const section of summarySections(note.summary)) out.push(...this.section(section, note, link));
    }

    if (note.screenshots.length) {
      out.push('## Скриншоты', '');
      for (const shot of note.screenshots) {
        out.push(`### ${link(shot.timestamp)}${shot.comment ? ` — ${shot.comment}` : ''}`, '', `![Скриншот ${shot.timestamp.format()}](${shot.imageData})`, '');
      }
    }
    return out.join('\n');
  }

  private section(section: SummarySection, note: VideoNote, link: (t: Timestamp) => string): string[] {
    const at = (seconds: number): string => link(Timestamp.of(seconds));
    const out = [`## ${section.title}`, ''];
    switch (section.kind) {
      case 'text':
        out.push(section.text);
        break;
      case 'markdown':
        out.push(linkTimecodes(section.text, note));
        break;
      case 'list':
        out.push(...section.items.map((i) => `- ${i}`));
        break;
      case 'timecodes':
        out.push(...section.items.map((i) => `- ${at(i.timestamp)} — ${i.text}`));
        break;
      case 'quotes':
        for (const q of section.items) out.push(`> «${q.text}» — ${at(q.timestamp)}`, '');
        break;
      case 'characters':
        out.push(...section.items.map((c) => `- **${c.name}**${c.role ? ` — ${c.role}` : ''}`));
        break;
      case 'reading':
        out.push(...section.items.map((r) => `- **${r.title}**${r.why ? ` — ${r.why}` : ''}`));
        break;
      case 'rating':
        out.push(`**${section.score} / 10**${section.comment ? ` — ${section.comment}` : ''}`);
        break;
    }
    out.push('');
    return out;
  }
}
