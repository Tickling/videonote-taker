import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '../../domain/errors.js';
import { CommandError, runCommand } from '../process/runCommand.js';

export const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // лимит OpenAI — 25 МБ

export interface AudioPart {
  path: string;
  offset: number;
}

export class FfmpegAudio {
  constructor(private readonly ffmpegBin: string) {}

  /** Делит файл на части < 24 МБ (по времени), чтобы пройти лимит Whisper API. */
  async splitForWhisper(path: string, maxBytes = WHISPER_MAX_BYTES): Promise<AudioPart[]> {
    const size = (await stat(path)).size;
    if (size <= maxBytes) return [{ path, offset: 0 }];
    const duration = await this.duration(path);
    const parts = Math.ceil(size / (maxBytes * 0.9));
    const segmentSeconds = Math.max(60, Math.floor(duration / parts));
    const dir = dirname(path);
    await this.ffmpeg(['-i', path, '-f', 'segment', '-segment_time', String(segmentSeconds), '-c', 'copy', '-reset_timestamps', '1', join(dir, 'part-%03d.mp3')]);
    const files = (await readdir(dir)).filter((f) => /^part-\d{3}\.mp3$/.test(f)).sort();
    return files.map((f, i) => ({ path: join(dir, f), offset: i * segmentSeconds }));
  }

  /** WAV 16 кГц моно — формат, который ждёт whisper.cpp. */
  async toWav16k(input: string, output: string): Promise<string> {
    await this.ffmpeg(['-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', output]);
    return output;
  }

  async duration(path: string): Promise<number> {
    // ffmpeg пишет длительность в stderr при пустом выводе
    try {
      await runCommand(this.ffmpegBin, ['-hide_banner', '-i', path], { timeoutMs: 30_000 });
    } catch (error) {
      if (error instanceof CommandError) {
        if (error.notFound) throw this.notInstalled();
        const m = error.stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      }
    }
    return 0;
  }

  async available(): Promise<boolean> {
    try {
      await runCommand(this.ffmpegBin, ['-version'], { timeoutMs: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async ffmpeg(args: string[]): Promise<void> {
    try {
      await runCommand(this.ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeoutMs: 60 * 60 * 1000 });
    } catch (error) {
      if (error instanceof CommandError && error.notFound) throw this.notInstalled();
      throw new AppError('TRANSCRIPTION_FAILED', 'Ошибка обработки аудио (ffmpeg)', error instanceof CommandError ? error.stderr : String(error));
    }
  }

  private notInstalled(): AppError {
    return new AppError('FFMPEG_NOT_INSTALLED', 'Для Whisper нужен ffmpeg. Установите его (см. README) и перезапустите сервер.');
  }
}
