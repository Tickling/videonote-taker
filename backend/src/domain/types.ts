import type { VideoTypeId } from '@shared/summaryContract.js';

export type { VideoTypeId };
export type TranscriptionMode = 'auto' | 'subtitles' | 'whisper' | 'local_whisper';
export type TranscriptSource = 'subtitles' | 'whisper' | 'local_whisper';
export type SummaryProviderId = 'groq' | 'gpt4o';

export interface Segment {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Transcript {
  segments: Segment[];
  source: TranscriptSource;
  totalDuration: number;
  language?: string;
}

export interface TimedItem {
  text: string;
  timestamp: number;
}

export interface SummaryResult {
  markdown: string;
  shortResume: string;
  keyPoints: TimedItem[];
  detailedNotes: string;
  quotes: TimedItem[];
  videoType: VideoTypeId;
  provider: SummaryProviderId;
}

export interface JobResult {
  title?: string;
  transcript: Transcript;
  summary?: SummaryResult;
  /** Транскрипт есть, но конспект не получился */
  summaryError?: { code: string; message: string };
}

export type JobStatusValue = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  videoUrl: string;
  language: string;
  videoType: VideoTypeId;
  mode: TranscriptionMode;
  generateSummary: boolean;
  status: JobStatusValue;
  progress: number;
  stage: string;
  result?: JobResult;
  error?: { code: string; message: string };
  createdAt: Date;
  updatedAt: Date;
}

/** Ключи провайдеров приходят из заголовков запроса и живут только в памяти на время задачи. */
export interface Credentials {
  openaiApiKey: string | null;
  groqApiKey: string | null;
  summaryProvider: SummaryProviderId;
}

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  language: string | null;
  subtitles: Record<string, unknown[]>;
  automaticCaptions: Record<string, unknown[]>;
}

export type ProgressReporter = (progress: number, stage: string) => void;
