import { SummaryProvider, type TranscriptSource } from '@domain/valueObjects/Providers';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoType } from '@domain/valueObjects/VideoType';

export const VIDEO_TYPE_LABELS: Record<VideoType, { emoji: string; label: string }> = {
  [VideoType.EDUCATIONAL]: { emoji: '🎓', label: 'Обучающий' },
  [VideoType.INTERVIEW]: { emoji: '🎙️', label: 'Интервью' },
  [VideoType.ENTERTAINMENT]: { emoji: '🎬', label: 'Развлечение' },
  [VideoType.MOVIE]: { emoji: '🎞️', label: 'Фильм' },
};

export const PLATFORM_LABELS: Record<VideoPlatform, string> = {
  [VideoPlatform.YOUTUBE]: 'YouTube',
  [VideoPlatform.RUTUBE]: 'Rutube',
  [VideoPlatform.VK_VIDEO]: 'VK Видео',
};

export const SUMMARY_PROVIDER_LABELS: Record<SummaryProvider, string> = {
  [SummaryProvider.GROQ]: 'Groq Llama 3.3',
  [SummaryProvider.OPENAI_GPT4O]: 'OpenAI GPT-4o',
};

export const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  subtitles: 'Автосубтитры',
  whisper: 'OpenAI Whisper',
  local_whisper: 'Локальный Whisper',
};
