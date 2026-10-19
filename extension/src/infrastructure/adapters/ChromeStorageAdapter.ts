import type { VideoNote } from '@domain/entities/VideoNote';
import type { INoteRepository } from '@domain/ports/INoteRepository';
import type { ISettingsRepository } from '@domain/ports/ISettingsRepository';
import { SummaryProvider, TranscriptionProvider } from '@domain/valueObjects/Providers';
import { DEFAULT_SETTINGS, normalizeApiKey, type UserSettings } from '@domain/valueObjects/UserSettings';
import { isVideoType } from '@domain/valueObjects/VideoType';
import { noteKey, STORAGE_KEYS } from '../messaging/messages';
import { fromDto, toDto, type VideoNoteDto } from './noteMapper';

type StorageArea = Pick<chrome.storage.StorageArea, 'get' | 'set' | 'remove'>;

function isNoteDto(value: unknown): value is VideoNoteDto {
  return typeof value === 'object' && value !== null && (value as { v?: unknown }).v === 1;
}

/** Заметки в chrome.storage.local (ключ note:<id>). */
export class ChromeStorageNoteRepository implements INoteRepository {
  constructor(private readonly storage: StorageArea = chrome.storage.local) {}

  async save(note: VideoNote): Promise<void> {
    await this.storage.set({ [noteKey(note.id)]: toDto(note) });
  }

  async findById(id: string): Promise<VideoNote | null> {
    const key = noteKey(id);
    const data = await this.storage.get(key);
    const raw: unknown = data[key];
    return isNoteDto(raw) ? fromDto(raw) : null;
  }

  async findAll(): Promise<VideoNote[]> {
    const data = await this.storage.get(null);
    const notes: VideoNote[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith(STORAGE_KEYS.notePrefix) || !isNoteDto(value)) continue;
      const note = fromDto(value);
      if (note) notes.push(note);
    }
    return notes;
  }

  async delete(id: string): Promise<void> {
    await this.storage.remove(noteKey(id));
  }
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function sanitizeSettings(raw: unknown): UserSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    transcriptionProvider: pickEnum(r['transcriptionProvider'], Object.values(TranscriptionProvider), DEFAULT_SETTINGS.transcriptionProvider),
    summaryProvider: pickEnum(r['summaryProvider'], Object.values(SummaryProvider), DEFAULT_SETTINGS.summaryProvider),
    openaiApiKey: normalizeApiKey(typeof r['openaiApiKey'] === 'string' ? r['openaiApiKey'] : null),
    groqApiKey: normalizeApiKey(typeof r['groqApiKey'] === 'string' ? r['groqApiKey'] : null),
    defaultLanguage: typeof r['defaultLanguage'] === 'string' ? r['defaultLanguage'] : DEFAULT_SETTINGS.defaultLanguage,
    defaultVideoType: isVideoType(r['defaultVideoType']) ? r['defaultVideoType'] : DEFAULT_SETTINGS.defaultVideoType,
    backendUrl: typeof r['backendUrl'] === 'string' && r['backendUrl'] ? r['backendUrl'] : DEFAULT_SETTINGS.backendUrl,
  };
}

/** Настройки и API-ключи — только в chrome.storage.local (не синхронизируются). */
export class ChromeStorageSettingsRepository implements ISettingsRepository {
  constructor(private readonly storage: StorageArea = chrome.storage.local) {}

  async get(): Promise<UserSettings> {
    const data = await this.storage.get(STORAGE_KEYS.settings);
    return sanitizeSettings(data[STORAGE_KEYS.settings]);
  }

  async save(settings: UserSettings): Promise<void> {
    await this.storage.set({ [STORAGE_KEYS.settings]: sanitizeSettings(settings) });
  }
}
