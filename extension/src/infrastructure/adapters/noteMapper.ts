import type { Screenshot } from '@domain/entities/Screenshot';
import type { Summary } from '@domain/entities/Summary';
import type { VideoNote } from '@domain/entities/VideoNote';
import { SummaryProvider, type TranscriptSource } from '@domain/valueObjects/Providers';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { isVideoType, VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';

/** Сериализуемое представление заметки для chrome.storage. */
export interface VideoNoteDto {
  v: 1;
  id: string;
  videoUrl: string;
  title: string;
  videoType: string;
  createdAt: string;
  updatedAt: string;
  language: string;
  transcript: {
    source: TranscriptSource;
    totalDuration: number;
    language?: string;
    segments: Array<{ id: string; text: string; s: number; e: number; c: number }>;
  };
  summary: {
    shortResume: string;
    keyPoints: Array<{ text: string; t: number }>;
    detailedNotes: string;
    quotes: Array<{ text: string; t: number }>;
    videoType: string;
    provider: string;
    createdAt?: string;
  } | null;
  screenshots: Array<{
    id: string;
    imageData: string;
    t: number;
    comment: string | null;
    linkedSegmentId: string | null;
    width?: number;
    height?: number;
  }>;
}

export function toDto(note: VideoNote): VideoNoteDto {
  return {
    v: 1,
    id: note.id,
    videoUrl: note.videoUrl.value,
    title: note.title,
    videoType: note.videoType,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    language: note.language,
    transcript: {
      source: note.transcript.source,
      totalDuration: note.transcript.totalDuration,
      ...(note.transcript.language ? { language: note.transcript.language } : {}),
      segments: note.transcript.segments.map((s) => ({
        id: s.id,
        text: s.text,
        s: s.start.seconds,
        e: s.end.seconds,
        c: s.confidence,
      })),
    },
    summary: note.summary
      ? {
          shortResume: note.summary.shortResume,
          keyPoints: note.summary.keyPoints.map((k) => ({ text: k.text, t: k.timestamp.seconds })),
          detailedNotes: note.summary.detailedNotes,
          quotes: note.summary.quotes.map((q) => ({ text: q.text, t: q.timestamp.seconds })),
          videoType: note.summary.videoType,
          provider: note.summary.provider,
          ...(note.summary.createdAt ? { createdAt: note.summary.createdAt.toISOString() } : {}),
        }
      : null,
    screenshots: note.screenshots.map((s) => ({
      id: s.id,
      imageData: s.imageData,
      t: s.timestamp.seconds,
      comment: s.comment,
      linkedSegmentId: s.linkedSegmentId,
      ...(s.width ? { width: s.width } : {}),
      ...(s.height ? { height: s.height } : {}),
    })),
  };
}

function toSummary(dto: NonNullable<VideoNoteDto['summary']>): Summary {
  return {
    shortResume: dto.shortResume,
    keyPoints: dto.keyPoints.map((k) => ({ text: k.text, timestamp: Timestamp.of(k.t) })),
    detailedNotes: dto.detailedNotes,
    quotes: dto.quotes.map((q) => ({ text: q.text, timestamp: Timestamp.of(q.t) })),
    videoType: isVideoType(dto.videoType) ? dto.videoType : VideoType.EDUCATIONAL,
    provider: dto.provider === SummaryProvider.OPENAI_GPT4O ? SummaryProvider.OPENAI_GPT4O : SummaryProvider.GROQ,
    ...(dto.createdAt ? { createdAt: new Date(dto.createdAt) } : {}),
  };
}

export function fromDto(dto: VideoNoteDto): VideoNote | null {
  const videoUrl = VideoUrl.tryCreate(dto.videoUrl);
  if (!videoUrl) return null;
  const screenshots: Screenshot[] = dto.screenshots.map((s) => ({
    id: s.id,
    imageData: s.imageData,
    timestamp: Timestamp.of(s.t),
    comment: s.comment,
    linkedSegmentId: s.linkedSegmentId,
    ...(s.width ? { width: s.width } : {}),
    ...(s.height ? { height: s.height } : {}),
  }));
  return {
    id: dto.id,
    videoUrl,
    title: dto.title,
    videoType: isVideoType(dto.videoType) ? dto.videoType : VideoType.EDUCATIONAL,
    platform: videoUrl.getPlatform(),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    language: dto.language,
    transcript: {
      source: dto.transcript.source,
      totalDuration: dto.transcript.totalDuration,
      ...(dto.transcript.language ? { language: dto.transcript.language } : {}),
      segments: dto.transcript.segments.map((s) => ({
        id: s.id,
        text: s.text,
        start: Timestamp.of(s.s),
        end: Timestamp.of(s.e),
        confidence: s.c,
      })),
    },
    summary: dto.summary ? toSummary(dto.summary) : null,
    screenshots,
  };
}
