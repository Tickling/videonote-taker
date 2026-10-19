import type { Segment } from '../../domain/types.js';

const HALLUCINATIONS = [
  /^продолжение следует/i,
  /субтитры (сделал|создавал|подготовил)/i,
  /редактор субтитров/i,
  /^спасибо за просмотр/i,
  /^thanks for watching/i,
  /^subtitles by/i,
  /amara\.org/i,
  /^\[?(музыка|music|applause|аплодисменты|blank_audio)\]?\.?$/i,
];

export function isHallucination(text: string): boolean {
  const t = text.trim();
  return t.length === 0 || HALLUCINATIONS.some((re) => re.test(t));
}

export interface RawSpeechSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
}

export function toSegments(raw: RawSpeechSegment[], offset: number, startIndex: number): Segment[] {
  return raw
    .filter((s) => (s.no_speech_prob ?? 0) < 0.6 && !isHallucination(s.text))
    .map((s, i) => ({
      id: `w${startIndex + i}`,
      text: s.text.trim(),
      start: offset + s.start,
      end: offset + s.end,
      confidence: s.avg_logprob !== undefined ? Math.min(1, Math.max(0, Math.exp(s.avg_logprob))) : 1,
    }));
}
