export type AppErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_URL'
  | 'SUBTITLES_NOT_FOUND'
  | 'VIDEO_PRIVATE'
  | 'VIDEO_UNAVAILABLE'
  | 'YTDLP_NOT_INSTALLED'
  | 'FFMPEG_NOT_INSTALLED'
  | 'LOCAL_WHISPER_NOT_CONFIGURED'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'TRANSCRIPTION_FAILED'
  | 'SUMMARIZATION_FAILED'
  | 'JOB_NOT_FOUND'
  | 'INTERNAL';

const HTTP_STATUS: Partial<Record<AppErrorCode, number>> = {
  INVALID_REQUEST: 400,
  UNSUPPORTED_URL: 400,
  MISSING_API_KEY: 400,
  INVALID_API_KEY: 401,
  JOB_NOT_FOUND: 404,
  SUBTITLES_NOT_FOUND: 422,
  VIDEO_PRIVATE: 422,
  VIDEO_UNAVAILABLE: 422,
  RATE_LIMITED: 429,
  YTDLP_NOT_INSTALLED: 503,
  FFMPEG_NOT_INSTALLED: 503,
  LOCAL_WHISPER_NOT_CONFIGURED: 503,
};

/** Ошибка с кодом для клиента и понятным пользователю сообщением. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code] ?? 500;
  }

  toJSON(): { code: AppErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export class SubtitlesNotFoundError extends AppError {
  constructor() {
    super('SUBTITLES_NOT_FOUND', 'Для этого видео нет субтитров. Включите Whisper в настройках ⚙️ расширения.');
  }
}

export class TranscriptionError extends AppError {
  constructor(message: string, details?: string) {
    super('TRANSCRIPTION_FAILED', message, details);
  }
}

export class SummarizationError extends AppError {
  constructor(message: string, code: AppErrorCode = 'SUMMARIZATION_FAILED') {
    super(code, message);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL', 'Внутренняя ошибка сервера', error instanceof Error ? error.message : String(error));
}
