import { AppError } from '../domain/errors.js';
import type { ILogger, ISpeechToTextFactory, IWorkDirFactory } from '../domain/ports.js';
import type { Segment } from '../domain/types.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface TranscribeChunkCommand {
  audio: Buffer;
  extension: string;
  start: number;
  language: string;
  mode: 'whisper' | 'local_whisper';
  openaiApiKey: string | null;
}

/** Real-time: один аудио-фрагмент → сегменты со смещением от начала видео. */
export class TranscribeChunkUseCase {
  constructor(
    private readonly speech: ISpeechToTextFactory,
    private readonly workDirs: IWorkDirFactory,
    private readonly logger: ILogger,
  ) {}

  async execute(command: TranscribeChunkCommand): Promise<Segment[]> {
    const engine =
      command.mode === 'local_whisper'
        ? this.speech.local()
        : command.openaiApiKey
          ? this.speech.openai(command.openaiApiKey)
          : null;
    if (!engine) {
      throw command.mode === 'local_whisper'
        ? new AppError('LOCAL_WHISPER_NOT_CONFIGURED', 'Локальный Whisper не настроен на сервере.')
        : new AppError('MISSING_API_KEY', 'Для Whisper нужен API-ключ OpenAI.');
    }
    const dir = await this.workDirs.create('chunk');
    try {
      const path = join(dir.path, `chunk.${command.extension}`);
      await writeFile(path, command.audio);
      const segments = await engine.transcribe(path, command.language);
      this.logger.debug({ start: command.start, segments: segments.length }, 'chunk transcribed');
      return segments.map((s) => ({
        ...s,
        id: `rt${Math.round(command.start * 1000)}-${s.id}`,
        start: s.start + command.start,
        end: s.end + command.start,
      }));
    } finally {
      await dir.cleanup();
    }
  }
}
