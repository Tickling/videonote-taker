import type { Summary } from '@domain/entities/Summary';
import type { RawSummary } from '@shared/summaryContract';
import { buildSummarySections, type SummarySection } from '@shared/summaryLayout';

/** Конспект домена → общий формат (секунды вместо Timestamp) для раскладки по типу видео. */
export function toRawSummary(summary: Summary): RawSummary {
  return {
    shortResume: summary.shortResume,
    keyPoints: summary.keyPoints.map((k) => ({ text: k.text, timestamp: k.timestamp.seconds })),
    detailedNotes: summary.detailedNotes,
    quotes: summary.quotes.map((q) => ({ text: q.text, timestamp: q.timestamp.seconds })),
    ideas: summary.ideas ?? [],
    conclusions: summary.conclusions ?? [],
    characters: summary.characters ?? [],
    rating: summary.rating ?? null,
    furtherReading: summary.furtherReading ?? [],
    example: summary.example ?? '',
  };
}

export function summarySections(summary: Summary): SummarySection[] {
  return buildSummarySections(toRawSummary(summary), summary.videoType);
}

export type { SummarySection };
