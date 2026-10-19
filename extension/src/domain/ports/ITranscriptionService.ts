import type { Transcript } from '../entities/Transcript';
import type { VideoUrl } from '../valueObjects/VideoUrl';

export interface ProgressUpdate {
  /** 0..100 */
  progress: number;
  /** Понятное пользователю описание этапа */
  stage: string;
}

export type ProgressListener = (update: ProgressUpdate) => void;

export interface TranscriptionInput {
  videoUrl?: VideoUrl; // для сценария "по ссылке"
  audioBlob?: Blob; // для real-time
  /** Смещение аудио-фрагмента от начала видео (real-time), сек */
  offsetSeconds?: number;
  language: string;
  onProgress?: ProgressListener;
}

export interface TranscriptionResult extends Transcript {
  /** Название видео, если источник его знает */
  title?: string;
}

export interface ITranscriptionService {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
