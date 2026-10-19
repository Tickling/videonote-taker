export enum TranscriptionProvider {
  SUBTITLES = 'subtitles', // Бесплатно, по умолчанию
  OPENAI_WHISPER = 'whisper', // Платно, опционально
  LOCAL_WHISPER = 'local_whisper', // Бесплатно, требует whisper.cpp рядом с backend
}

export enum SummaryProvider {
  GROQ = 'groq', // Бесплатно, по умолчанию
  OPENAI_GPT4O = 'gpt4o', // Платно, опционально
}

export type TranscriptSource = 'subtitles' | 'whisper' | 'local_whisper';
