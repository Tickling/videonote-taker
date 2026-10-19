import type { Timestamp } from '../valueObjects/Timestamp';

export interface Screenshot {
  id: string;
  imageData: string; // data:image/jpeg;base64,...
  timestamp: Timestamp;
  comment: string | null;
  linkedSegmentId: string | null;
  width?: number;
  height?: number;
}
