import { availableParallelism } from 'node:os';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '../../domain/errors.js';
import type { ILogger, ISpeechToText } from '../../domain/ports.js';
import type { Segment } from '../../domain/types.js';
import type { FfmpegAudio } from '../adapters/FfmpegAudio.js';
import { CommandError, runCommand } from '../process/runCommand.js';
import { toSegments } from './whisperFilter.js';

interface WhisperCppJson {
  transcription?: Array<{ offsets?: { from: number; to: number }; text?: string }>;
}

/** Локальный whisper.cpp: бесплатно, распознавание на компьютере пользователя. */
export class LocalWhisperProvider implements ISpeechToText {
  constructor(
    private readonly binPath: string,
    private readonly modelPath: string,
    private readonly ffmpeg: FfmpegAudio,
    private readonly logger: ILogger,
  ) {}

  async transcribe(audioPath: string, language: string, onProgress?: (done: number, total: number) => void): Promise<Segment[]> {
    onProgress?.(0, 1);
    const wav = await this.ffmpeg.toWav16k(audioPath, join(dirname(audioPath), 'audio-16k.wav'));
    const outBase = join(dirname(audioPath), 'whisper-out');
    const threads = String(Math.max(1, Math.min(8, availableParallelism() - 1)));
    const started = Date.now();
    try {
      await runCommand(this.binPath, ['-m', this.modelPath, '-f', wav, '-l', language, '-t', threads, '-oj', '-of', outBase, '-np'], {
        timeoutMs: 6 * 60 * 60 * 1000,
      });
    } catch (error) {
      if (error instanceof CommandError && error.notFound) {
        throw new AppError('LOCAL_WHISPER_NOT_CONFIGURED', `Не найден whisper.cpp по пути ${this.binPath}. Проверьте WHISPER_CPP_PATH в backend/.env.`);
      }
      throw new AppError('TRANSCRIPTION_FAILED', 'Локальный Whisper завершился с ошибкой', error instanceof CommandError ? error.stderr.slice(-1000) : String(error));
    }
    this.logger.info({ ms: Date.now() - started }, 'local whisper done');
    const json = JSON.parse(await readFile(`${outBase}.json`, 'utf8')) as WhisperCppJson;
    onProgress?.(1, 1);
    return toSegments(
      (json.transcription ?? []).map((t) => ({
        start: (t.offsets?.from ?? 0) / 1000,
        end: (t.offsets?.to ?? 0) / 1000,
        text: t.text ?? '',
      })),
      0,
      0,
    );
  }
}
