import type { TranscriptSource } from '../valueObjects/Providers';
import type { Timestamp } from '../valueObjects/Timestamp';
import type { Segment } from './Segment';

export interface Transcript {
  segments: Segment[];
  totalDuration: number;
  source: TranscriptSource; // откуда получено
  language?: string;
}

export function emptyTranscript(source: TranscriptSource = 'subtitles'): Transcript {
  return { segments: [], totalDuration: 0, source };
}

/** Сегмент, который звучит в момент time (или ближайший предыдущий). */
export function findSegmentAt(transcript: Transcript, time: Timestamp): Segment | null {
  let candidate: Segment | null = null;
  for (const segment of transcript.segments) {
    if (segment.start.seconds <= time.seconds) candidate = segment;
    else break;
  }
  return candidate;
}

/** Добавляет сегменты (real-time), сохраняя порядок по времени. */
export function appendSegments(transcript: Transcript, segments: Segment[]): Transcript {
  const merged = [...transcript.segments, ...segments].sort(
    (a, b) => a.start.seconds - b.start.seconds,
  );
  const lastEnd = merged.reduce((max, s) => Math.max(max, s.end.seconds), 0);
  return { ...transcript, segments: merged, totalDuration: Math.max(transcript.totalDuration, lastEnd) };
}

export function transcriptToPlainText(transcript: Transcript): string {
  return transcript.segments.map((s) => `[${s.start.format()}] ${s.text}`).join('\n');
}
