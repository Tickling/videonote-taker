import type { Segment } from '../entities/Segment';
import type { TranscriptSource } from '../valueObjects/Providers';
import type { VideoType } from '../valueObjects/VideoType';

export type TranscriptionMode = 'subtitles' | 'whisper' | 'local_whisper';

export interface TranscribeByUrlOptions {
  mode?: TranscriptionMode;
  generateSummary?: boolean;
}

export interface JobSegmentDto {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface JobResultDto {
  title?: string;
  transcript: {
    segments: JobSegmentDto[];
    source: TranscriptSource;
    totalDuration: number;
    language?: string;
  };
}

export interface JobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  result?: JobResultDto;
  error?: { code: string; message: string };
}

export interface BackendHealth {
  ok: boolean;
  ytDlp: boolean;
  ffmpeg: boolean;
  localWhisper: boolean;
}

export interface IBackendClient {
  transcribeByUrl(
    url: string,
    language: string,
    videoType: VideoType,
    options?: TranscribeByUrlOptions,
  ): Promise<{ jobId: string; estimatedTime?: number }>;
  getJobStatus(jobId: string): Promise<JobStatus>;
  transcribeChunk(audioBlob: Blob, timestamp: number, language?: string): Promise<Segment[]>;
  health(): Promise<BackendHealth>;
}
