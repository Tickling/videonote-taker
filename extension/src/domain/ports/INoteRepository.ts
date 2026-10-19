import type { VideoNote } from '../entities/VideoNote';

export interface INoteRepository {
  save(note: VideoNote): Promise<void>;
  findById(id: string): Promise<VideoNote | null>;
  findAll(): Promise<VideoNote[]>;
  delete(id: string): Promise<void>;
}
