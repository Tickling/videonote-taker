import type { VideoType } from '@domain/valueObjects/VideoType';

/** Состояние фоновой задачи по заметке (хранится в chrome.storage.local под ключом task:<noteId>). */
export interface TaskState {
  noteId: string;
  kind: 'create' | 'summary';
  status: 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  error?: { code: string; message: string };
  /** Предупреждение при частичном успехе (например, транскрипт есть, ключа Groq нет) */
  warning?: { code: string; message: string };
  updatedAt: number;
}

export interface RealtimeState {
  tabId: number;
  noteId: string;
  status: 'recording' | 'stopped' | 'error';
  method?: 'tabCapture' | 'videoElement';
  chunks: number;
  error?: string;
  updatedAt: number;
}

/** Сообщения в background service worker. */
export type BackgroundRequest =
  | { type: 'create-note'; url: string; language: string; videoType: VideoType; title?: string }
  | { type: 'generate-summary'; noteId: string; videoType?: VideoType; language?: string }
  | { type: 'capture-visible-tab' }
  | { type: 'get-tab-id' }
  | { type: 'realtime-start'; tabId: number; pageUrl: string; title: string; language: string; videoType: VideoType }
  | { type: 'realtime-stop'; tabId: number }
  | { type: 'open-guide'; guide: GuideName }
  | { type: 'open-settings' }
  | { type: 'download'; dataUrl: string; filename: string };

export type GuideName = 'groq' | 'openai' | 'local-whisper';

/** Сообщения из offscreen-документа / content script с аудио. */
export type AudioChunkMessage = {
  type: 'realtime-chunk';
  tabId: number;
  audioBase64: string;
  mimeType: string;
  /** Позиция видео в начале фрагмента; null — узнать у content script */
  videoTime: number | null;
  seq: number;
};

export type OffscreenEvent =
  | AudioChunkMessage
  | { type: 'realtime-chunk-start'; tabId: number; seq: number }
  | { type: 'realtime-error'; tabId: number; message: string };

/** Команды для offscreen-документа. */
export type OffscreenCommand =
  | { target: 'offscreen'; type: 'start-recording'; tabId: number; streamId: string; chunkSeconds: number }
  | { target: 'offscreen'; type: 'stop-recording'; tabId: number };

/** Команды для content script вкладки. */
export type ContentCommand =
  | { type: 'take-screenshot' }
  | { type: 'toggle-sidebar' }
  | { type: 'get-video-state' }
  | { type: 'start-element-recording'; chunkSeconds: number }
  | { type: 'stop-element-recording' }
  | { type: 'extract-youtube-captions'; videoId: string; language: string };

export interface VideoState {
  url: string;
  title: string;
  currentTime: number;
  paused: boolean;
  duration: number;
  hasVideo: boolean;
}

export type BackgroundResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export const STORAGE_KEYS = {
  settings: 'settings',
  notePrefix: 'note:',
  taskPrefix: 'task:',
  realtimePrefix: 'realtime:',
} as const;

export function noteKey(id: string): string {
  return `${STORAGE_KEYS.notePrefix}${id}`;
}
export function taskKey(noteId: string): string {
  return `${STORAGE_KEYS.taskPrefix}${noteId}`;
}
export function realtimeKey(tabId: number): string {
  return `${STORAGE_KEYS.realtimePrefix}${tabId}`;
}

export async function sendToBackground<T>(message: BackgroundRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as BackgroundResponse<T> | undefined;
  if (!response) throw new Error('Фоновый процесс расширения не ответил');
  if (!response.ok) {
    const error = new Error(response.error.message);
    (error as Error & { code?: string }).code = response.error.code;
    throw error;
  }
  return response.data;
}
