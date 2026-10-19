import type { SummaryProvider } from '../valueObjects/Providers';
import type { Timestamp } from '../valueObjects/Timestamp';
import type { VideoType } from '../valueObjects/VideoType';

export interface TimedText {
  text: string;
  timestamp: Timestamp;
}

export interface Summary {
  shortResume: string;
  keyPoints: TimedText[];
  detailedNotes: string; // Markdown
  quotes: TimedText[];
  videoType: VideoType;
  provider: SummaryProvider; // какой LLM использовался
  createdAt?: Date;
}
