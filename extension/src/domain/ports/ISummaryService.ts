import type { Screenshot } from '../entities/Screenshot';
import type { Summary } from '../entities/Summary';
import type { Transcript } from '../entities/Transcript';
import type { VideoType } from '../valueObjects/VideoType';
import type { ProgressListener } from './ITranscriptionService';

export interface SummaryOptions {
  language: string;
  title?: string;
  onProgress?: ProgressListener;
}

export interface ISummaryService {
  generate(
    transcript: Transcript,
    videoType: VideoType,
    screenshots?: Screenshot[],
    options?: SummaryOptions,
  ): Promise<Summary>;
}
