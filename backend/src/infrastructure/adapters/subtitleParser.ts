import type { Segment } from '../../domain/types.js';

interface Cue {
  start: number;
  end: number;
  lines: string[];
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const CUE_TIMING = new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);

function toSeconds(h: string | undefined, m: string | undefined, s: string | undefined, ms: string | undefined): number {
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0) + Number((ms ?? '0').padEnd(3, '0')) / 1000;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function cleanCaptionText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '') // <c>, <00:00:01.000>, <i>, <font>
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\[(музыка|music|аплодисменты|applause|смех|laughter)\]/gi, '')
    .replace(/\{\\an\d\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCues(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((l) => CUE_TIMING.test(l));
    if (timingIndex === -1) continue;
    const m = (lines[timingIndex] ?? '').match(CUE_TIMING);
    if (!m) continue;
    cues.push({
      start: toSeconds(m[1], m[2], m[3], m[4]),
      end: toSeconds(m[5], m[6], m[7], m[8]),
      lines: lines.slice(timingIndex + 1).map(cleanCaptionText).filter((l) => l.length > 0),
    });
  }
  return cues;
}

/** Автосубтитры YouTube «прокручиваются»: каждая реплика повторяет предыдущую строку. */
export function isRollingCaptions(content: string): boolean {
  return /<c>|<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(content) || /align:start position:0%/.test(content);
}

/** Разбор WebVTT/SRT в сегменты с устранением дублей автосубтитров. */
export function parseSubtitles(content: string): Segment[] {
  const cues = parseCues(content);
  const rolling = isRollingCaptions(content);
  const segments: Segment[] = [];
  const recent: string[] = [];

  const push = (text: string, start: number, end: number): void => {
    const last = segments[segments.length - 1];
    if (last && last.text === text) {
      last.end = Math.max(last.end, end);
      return;
    }
    segments.push({ id: `s${segments.length}`, text, start, end, confidence: 1 });
  };

  for (const cue of cues) {
    if (cue.lines.length === 0) continue;
    if (rolling) {
      if (cue.end - cue.start < 0.05) continue; // переходные «мигающие» реплики
      for (const line of cue.lines) {
        if (recent.includes(line)) continue;
        push(line, cue.start, cue.end);
        recent.push(line);
        if (recent.length > 4) recent.shift();
      }
    } else {
      push(cue.lines.join(' '), cue.start, cue.end);
    }
  }
  // Конец сегмента не должен заходить на начало следующего
  for (let i = 0; i < segments.length - 1; i += 1) {
    const cur = segments[i];
    const next = segments[i + 1];
    if (cur && next && cur.end > next.start) cur.end = Math.max(cur.start, next.start);
  }
  return segments;
}
