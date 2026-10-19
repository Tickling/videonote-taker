import { formatTimecode } from './timecode.js';
import type { RawSummary, VideoTypeId } from './summaryContract.js';
import { buildSummarySections, type SummarySection } from './summaryLayout.js';

type LinkFn = (seconds: number) => string;

function sectionToMarkdown(section: SummarySection, link: LinkFn): string[] {
  const out = [`## ${section.title}`, ''];
  switch (section.kind) {
    case 'text':
    case 'markdown':
      out.push(section.text);
      break;
    case 'list':
      out.push(...section.items.map((i) => `- ${i}`));
      break;
    case 'timecodes':
      out.push(...section.items.map((i) => `- ${link(i.timestamp)} — ${i.text}`));
      break;
    case 'quotes':
      for (const q of section.items) out.push(`> «${q.text}» — ${link(q.timestamp)}`, '');
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

/** Markdown-представление конспекта. link — как оформить таймкод (по умолчанию [ММ:СС]). */
export function summaryToMarkdown(summary: RawSummary, videoType: VideoTypeId, title?: string, link: LinkFn = (t) => `[${formatTimecode(t)}]`): string {
  const out: string[] = [];
  if (title) out.push(`# ${title}`, '');
  for (const section of buildSummarySections(summary, videoType)) out.push(...sectionToMarkdown(section, link));
  return out.join('\n').trim() + '\n';
}
