import { formatTimecode } from './timecode.js';
import type { RawSummary } from './summaryContract.js';

/** Markdown-представление конспекта (контракт backend: summary.markdown). */
export function summaryToMarkdown(summary: RawSummary, title?: string): string {
  const out: string[] = [];
  if (title) out.push(`# ${title}`, '');
  if (summary.shortResume) out.push('## Кратко', '', summary.shortResume, '');
  if (summary.keyPoints.length > 0) {
    out.push('## Ключевые моменты', '');
    for (const point of summary.keyPoints) out.push(`- **[${formatTimecode(point.timestamp)}]** ${point.text}`);
    out.push('');
  }
  if (summary.detailedNotes) out.push('## Подробный конспект', '', summary.detailedNotes, '');
  if (summary.quotes.length > 0) {
    out.push('## Цитаты', '');
    for (const quote of summary.quotes) out.push(`> «${quote.text}» — [${formatTimecode(quote.timestamp)}]`, '');
  }
  return out.join('\n').trim() + '\n';
}
