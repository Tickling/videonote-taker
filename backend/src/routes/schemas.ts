import { parseVideoUrl } from '@shared/videoUrl.js';
import { z } from 'zod';
import type { Credentials } from '../domain/types.js';

export const TranscribeByUrlBody = z.object({
  videoUrl: z.string().min(1).refine((v) => parseVideoUrl(v) !== null, {
    message: 'Поддерживаются только ссылки YouTube, Rutube и VK Видео',
  }),
  language: z.string().min(2).max(10).default('ru'),
  videoType: z.enum(['educational', 'interview', 'entertainment', 'movie']).default('educational'),
  generateSummary: z.boolean().default(false),
  transcriptionMode: z.enum(['auto', 'subtitles', 'whisper', 'local_whisper']).default('auto'),
});

export const ChunkQuery = z.object({
  start: z.coerce.number().min(0).default(0),
  language: z.string().min(2).max(10).default('ru'),
  mode: z.enum(['whisper', 'local_whisper']).default('whisper'),
});

function header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name];
  const str = Array.isArray(value) ? value[0] : value;
  return str && str.trim() ? str.trim() : null;
}

/** Ключи — только из заголовков текущего запроса, на диск не пишутся. */
export function credentialsFrom(headers: Record<string, string | string[] | undefined>): Credentials {
  return {
    openaiApiKey: header(headers, 'x-openai-api-key'),
    groqApiKey: header(headers, 'x-groq-api-key'),
    summaryProvider: header(headers, 'x-summary-provider') === 'gpt4o' ? 'gpt4o' : 'groq',
  };
}
