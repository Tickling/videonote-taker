import type { VideoPlatform } from '../valueObjects/VideoPlatform';
import type { VideoType } from '../valueObjects/VideoType';
import type { VideoUrl } from '../valueObjects/VideoUrl';
import type { Screenshot } from './Screenshot';
import type { Summary } from './Summary';
import { emptyTranscript, type Transcript } from './Transcript';

export interface VideoNote {
  id: string;
  videoUrl: VideoUrl;
  title: string;
  videoType: VideoType;
  platform: VideoPlatform;
  createdAt: Date;
  updatedAt: Date;
  transcript: Transcript;
  summary: Summary | null;
  screenshots: Screenshot[];
  language: string;
}

export interface CreateVideoNoteParams {
  videoUrl: VideoUrl;
  title?: string;
  videoType: VideoType;
  language: string;
  transcript?: Transcript;
  now?: Date;
}

/** id заметки = ключ видео: повторная обработка того же видео обновляет заметку. */
export function createVideoNote(params: CreateVideoNoteParams): VideoNote {
  const now = params.now ?? new Date();
  return {
    id: params.videoUrl.getKey(),
    videoUrl: params.videoUrl,
    title: params.title?.trim() || params.videoUrl.getCanonicalUrl(),
    videoType: params.videoType,
    platform: params.videoUrl.getPlatform(),
    createdAt: now,
    updatedAt: now,
    transcript: params.transcript ?? emptyTranscript(),
    summary: null,
    screenshots: [],
    language: params.language,
  };
}

export function hasContent(note: VideoNote): boolean {
  return note.transcript.segments.length > 0 || note.summary !== null || note.screenshots.length > 0;
}
