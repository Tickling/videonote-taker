import type { Segment } from '@domain/entities/Segment';
import { Timestamp } from '@domain/valueObjects/Timestamp';

export interface WhisperSegmentLike {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
}

// Типичные «галлюцинации» Whisper на тишине и музыке
const HALLUCINATIONS = [
  /^продолжение следует/i,
  /субтитры (сделал|создавал|подготовил)/i,
  /редактор субтитров/i,
  /^спасибо за просмотр/i,
  /^thanks for watching/i,
  /^subtitles by/i,
  /amara\.org/i,
  /^\[?(музыка|music|applause|аплодисменты)\]?\.?$/i,
];

export function isHallucination(text: string): boolean {
  const t = text.trim();
  return t.length === 0 || HALLUCINATIONS.some((re) => re.test(t));
}

export function whisperToSegments(
  segments: WhisperSegmentLike[],
  offsetSeconds: number,
  idPrefix: string,
): Segment[] {
  return segments
    .filter((s) => (s.no_speech_prob ?? 0) < 0.6 && !isHallucination(s.text))
    .map((s, i) => ({
      id: `${idPrefix}-${i}`,
      text: s.text.trim(),
      start: Timestamp.of(offsetSeconds + s.start),
      end: Timestamp.of(offsetSeconds + s.end),
      confidence: s.avg_logprob !== undefined ? Math.min(1, Math.max(0, Math.exp(s.avg_logprob))) : 1,
    }));
}
