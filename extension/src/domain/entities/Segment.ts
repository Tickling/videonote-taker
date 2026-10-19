import type { Timestamp } from '../valueObjects/Timestamp';

export interface Segment {
  id: string;
  text: string;
  start: Timestamp;
  end: Timestamp;
  confidence: number;
}
