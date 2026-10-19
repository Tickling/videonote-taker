import { SummaryProvider, type TranscriptSource } from '@domain/valueObjects/Providers';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoType } from '@domain/valueObjects/VideoType';

export const VIDEO_TYPE_LABELS: Record<VideoType, { emoji: string; label: string }> = {
  [VideoType.EDUCATIONAL]: { emoji: '🎓', label: 'Обучающий' },
  [VideoType.INTERVIEW]: { emoji: '🎙️', label: 'Интервью' },
  [VideoType.ENTERTAINMENT]: { emoji: '🎬', label: 'Развлечение' },
  [VideoType.MOVIE]: { emoji: '🎞️', label: 'Фильм' },
};

/** Что войдёт в конспект для каждого типа видео (подсказки в интерфейсе). */
export const VIDEO_TYPE_HINTS: Record<VideoType, string> = {
  [VideoType.EDUCATIONAL]: 'Главные мысли и идеи, о чём видео, таймкоды + помощь от ИИ: что почитать по теме и практический пример',
  [VideoType.INTERVIEW]: 'Основные идеи собеседников, яркие цитаты, выводы и таймкоды',
  [VideoType.ENTERTAINMENT]: 'Коротко: суть видео и таймкоды',
  [VideoType.MOVIE]: 'Мысли и идеи, о чём фильм, герои по именам, таймкоды и оценка ИИ из 10',
};

export const PLATFORM_LABELS: Record<VideoPlatform, string> = {
  [VideoPlatform.YOUTUBE]: 'YouTube',
  [VideoPlatform.RUTUBE]: 'Rutube',
  [VideoPlatform.VK_VIDEO]: 'VK Видео',
};

export const SUMMARY_PROVIDER_LABELS: Record<SummaryProvider, string> = {
  [SummaryProvider.GROQ]: 'Groq (бесплатно)',
  [SummaryProvider.OPENAI_GPT4O]: 'OpenAI GPT-4o',
};

export const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  subtitles: 'Автосубтитры',
  whisper: 'OpenAI Whisper',
  local_whisper: 'Локальный Whisper',
};
