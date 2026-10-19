import { SummaryProvider, TranscriptionProvider } from './Providers';
import { VideoType } from './VideoType';

export interface UserSettings {
  /** Чем транскрибировать, если автосубтитров нет. SUBTITLES = только субтитры. */
  transcriptionProvider: TranscriptionProvider;
  summaryProvider: SummaryProvider;
  openaiApiKey: string | null;
  groqApiKey: string | null;
  defaultLanguage: string;
  defaultVideoType: VideoType;
  backendUrl: string;
}

export const DEFAULT_BACKEND_URL = 'http://localhost:3000';

export const DEFAULT_SETTINGS: UserSettings = {
  transcriptionProvider: TranscriptionProvider.SUBTITLES,
  summaryProvider: SummaryProvider.GROQ,
  openaiApiKey: null,
  groqApiKey: null,
  defaultLanguage: 'ru',
  defaultVideoType: VideoType.EDUCATIONAL,
  backendUrl: DEFAULT_BACKEND_URL,
};

export function normalizeApiKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Какой ключ нужен для выбранной саммаризации. */
export function requiredSummaryKey(settings: UserSettings): 'groq' | 'openai' {
  return settings.summaryProvider === SummaryProvider.OPENAI_GPT4O ? 'openai' : 'groq';
}
