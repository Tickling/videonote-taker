import { describe, expect, it } from 'vitest';
import { createVideoNote } from '@domain/entities/VideoNote';
import { SummaryProvider, TranscriptionProvider } from '@domain/valueObjects/Providers';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { DEFAULT_SETTINGS } from '@domain/valueObjects/UserSettings';
import { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { ChromeStorageNoteRepository, ChromeStorageSettingsRepository } from './ChromeStorageAdapter';

function memoryStorage() {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys: string | null) {
      if (keys === null) return { ...data };
      return keys in data ? { [keys]: structuredClone(data[keys]) } : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, structuredClone(items));
    },
    async remove(key: string) {
      delete data[key];
    },
  } as unknown as chrome.storage.StorageArea & { data: Record<string, unknown> };
}

describe('ChromeStorageNoteRepository', () => {
  it('round-trips a full note', async () => {
    const storage = memoryStorage();
    const repo = new ChromeStorageNoteRepository(storage);
    const note = {
      ...createVideoNote({ videoUrl: new VideoUrl('https://youtu.be/dQw4w9WgXcQ'), title: 'T', videoType: VideoType.INTERVIEW, language: 'ru' }),
      transcript: { source: 'whisper' as const, totalDuration: 10, segments: [{ id: 's', text: 'x', start: new Timestamp(1), end: new Timestamp(2), confidence: 0.9 }] },
      summary: {
        shortResume: 'S',
        keyPoints: [{ text: 'k', timestamp: new Timestamp(5) }],
        detailedNotes: 'd',
        quotes: [],
        videoType: VideoType.INTERVIEW,
        provider: SummaryProvider.OPENAI_GPT4O,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      screenshots: [{ id: 'p', imageData: 'data:', timestamp: new Timestamp(3), comment: 'c', linkedSegmentId: 's', width: 10, height: 5 }],
    };
    await repo.save(note);
    expect(Object.keys(storage.data)).toEqual(['note:youtube_dQw4w9WgXcQ']);
    const loaded = await repo.findById(note.id);
    expect(loaded).toEqual(note);
    expect(await repo.findAll()).toHaveLength(1);
    await repo.delete(note.id);
    expect(await repo.findById(note.id)).toBeNull();
  });
});

describe('ChromeStorageSettingsRepository', () => {
  it('returns defaults and sanitizes stored values', async () => {
    const storage = memoryStorage();
    const repo = new ChromeStorageSettingsRepository(storage);
    expect(await repo.get()).toEqual(DEFAULT_SETTINGS);
    storage.data['settings'] = { transcriptionProvider: 'bogus', groqApiKey: '  gsk ', defaultVideoType: 'movie', summaryProvider: 'gpt4o' };
    const settings = await repo.get();
    expect(settings.transcriptionProvider).toBe(TranscriptionProvider.SUBTITLES);
    expect(settings.groqApiKey).toBe('gsk');
    expect(settings.defaultVideoType).toBe(VideoType.MOVIE);
    expect(settings.summaryProvider).toBe(SummaryProvider.OPENAI_GPT4O);
  });
});
