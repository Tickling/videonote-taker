export type ErrorCode =
  | 'UNSUPPORTED_URL'
  | 'SUBTITLES_NOT_FOUND'
  | 'TRANSCRIPTION_FAILED'
  | 'SUMMARIZATION_FAILED'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'BACKEND_UNAVAILABLE'
  | 'VIDEO_UNAVAILABLE'
  | 'SCREENSHOT_FAILED'
  | 'NOT_FOUND';

/** Базовая доменная ошибка: message — понятный пользователю текст на русском. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedVideoUrlError extends DomainError {
  constructor(url: string) {
    super(
      `Ссылка не поддерживается: ${url}. Поддерживаются YouTube, Rutube и VK Видео.`,
      'UNSUPPORTED_URL',
    );
  }
}

export class SubtitlesNotFoundError extends DomainError {
  constructor(
    message = 'Для этого видео нет автосубтитров. Добавьте OpenAI API-ключ в настройках ⚙️ для транскрибации через Whisper.',
  ) {
    super(message, 'SUBTITLES_NOT_FOUND');
  }
}

export class TranscriptionError extends DomainError {
  constructor(message: string, code: ErrorCode = 'TRANSCRIPTION_FAILED') {
    super(message, code);
  }
}

export class SummarizationError extends DomainError {
  constructor(message: string, code: ErrorCode = 'SUMMARIZATION_FAILED') {
    super(message, code);
  }
}

export class MissingApiKeyError extends DomainError {
  constructor(
    readonly provider: 'groq' | 'openai',
    message?: string,
  ) {
    super(
      message ??
        (provider === 'groq'
          ? 'Для конспекта нужен бесплатный ключ Groq. Получите его за 2 минуты и вставьте в настройках ⚙️.'
          : 'Нужен API-ключ OpenAI. Добавьте его в настройках ⚙️.'),
      'MISSING_API_KEY',
    );
  }
}

export class InvalidApiKeyError extends DomainError {
  constructor(readonly provider: 'groq' | 'openai') {
    super(
      provider === 'groq'
        ? 'Ключ Groq не подошёл. Проверьте, что он скопирован полностью (начинается с gsk_).'
        : 'Ключ OpenAI не подошёл. Проверьте ключ (начинается с sk-) и баланс аккаунта.',
      'INVALID_API_KEY',
    );
  }
}

export class NoteNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Конспект не найден: ${id}`, 'NOT_FOUND');
  }
}
