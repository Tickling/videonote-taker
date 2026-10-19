import type { VideoNote } from '@domain/entities/VideoNote';
import type { ILogger } from '@domain/ports/ILogger';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { DEFAULT_SETTINGS, type UserSettings } from '@domain/valueObjects/UserSettings';

export class InMemoryNoteRepository implements INoteRepository {
  readonly items = new Map<string, VideoNote>();
  async save(note: VideoNote): Promise<void> {
    this.items.set(note.id, note);
  }
  async findById(id: string): Promise<VideoNote | null> {
    return this.items.get(id) ?? null;
  }
  async findAll(): Promise<VideoNote[]> {
    return [...this.items.values()];
  }
  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

export class InMemorySettingsRepository implements ISettingsRepository {
  constructor(public value: UserSettings = { ...DEFAULT_SETTINGS }) {}
  async get(): Promise<UserSettings> {
    return this.value;
  }
  async save(settings: UserSettings): Promise<void> {
    this.value = settings;
  }
}

export const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

export function transcriptOf(...texts: Array<[number, string]>): TranscriptionResult {
  return {
    source: 'subtitles',
    totalDuration: texts.length ? (texts[texts.length - 1]?.[0] ?? 0) + 5 : 0,
    segments: texts.map(([start, text], i) => ({
      id: `s${i}`,
      text,
      start: new Timestamp(start),
      end: new Timestamp(start + 5),
      confidence: 1,
    })),
  };
}

export class StubTranscription implements ITranscriptionService {
  calls: TranscriptionInput[] = [];
  constructor(private readonly impl: (input: TranscriptionInput) => Promise<TranscriptionResult>) {}
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    this.calls.push(input);
    return this.impl(input);
  }
}
