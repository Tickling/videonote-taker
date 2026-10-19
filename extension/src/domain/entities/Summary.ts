import type { SummaryProvider } from '../valueObjects/Providers';
import type { Timestamp } from '../valueObjects/Timestamp';
import type { VideoType } from '../valueObjects/VideoType';

export interface TimedText {
  text: string;
  timestamp: Timestamp;
}

export interface Character {
  name: string;
  role: string;
}

export interface ReadingItem {
  title: string;
  why: string;
}

export interface Summary {
  /** «О чём видео» / «Краткая суть» */
  shortResume: string;
  /** Таймкоды */
  keyPoints: TimedText[];
  detailedNotes: string; // Markdown, старый формат
  quotes: TimedText[];
  ideas?: string[];
  conclusions?: string[];
  characters?: Character[];
  rating?: { score: number; comment: string } | null;
  furtherReading?: ReadingItem[];
  example?: string;
  videoType: VideoType;
  provider: SummaryProvider; // какой LLM использовался
  createdAt?: Date;
}
