import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, TranscriptionError } from '../../domain/errors.js';
import type { IAudioDownloader, ILogger, IVideoInfoProvider } from '../../domain/ports.js';
import type { VideoInfo } from '../../domain/types.js';
import { CommandError, runCommand } from '../process/runCommand.js';

export interface YtDlpConfig {
  bin: string;
  ffmpegPath?: string | undefined;
  extraArgs: string[];
  /** Прокси (например, от VPN-клиента): socks5://127.0.0.1:10808 или http://127.0.0.1:2080 */
  proxy?: string | undefined;
  /** Передать yt-dlp текущий Node как JS-движок (нужен YouTube с 2025 г.) */
  useNodeJsRuntime: boolean;
}

const IGNORED_SUB_KEYS = new Set(['live_chat', 'rechat', 'danmaku', 'comments']);

export interface SubtitleTrack {
  key: string;
  auto: boolean;
}

/** Выбор дорожки: ручные на нужном языке → ручные оригинал → автосубтитры оригинала → автоперевод → любые. */
export function chooseSubtitleTracks(info: VideoInfo, language: string): SubtitleTrack[] {
  const manual = Object.keys(info.subtitles).filter((k) => !IGNORED_SUB_KEYS.has(k));
  const auto = Object.keys(info.automaticCaptions).filter((k) => !IGNORED_SUB_KEYS.has(k));
  const base = (k: string): string => k.split(/[-_]/)[0]?.toLowerCase() ?? k;
  const original = info.language ? base(info.language) : null;
  const tracks: SubtitleTrack[] = [];
  const add = (key: string | undefined, isAuto: boolean): void => {
    if (key && !tracks.some((t) => t.key === key && t.auto === isAuto)) tracks.push({ key, auto: isAuto });
  };

  add(manual.find((k) => base(k) === language), false);
  add(manual.find((k) => original !== null && base(k) === original), false);
  add(manual[0], false);
  add(auto.find((k) => k.endsWith('-orig')), true);
  add(auto.find((k) => original !== null && k === original), true);
  add(auto.find((k) => base(k) === language), true);
  add(auto[0], true);
  return tracks;
}

function classify(error: unknown, action: string): AppError {
  if (error instanceof CommandError) {
    if (error.notFound) {
      return new AppError('YTDLP_NOT_INSTALLED', 'yt-dlp не установлен на сервере. Установите его (см. README) и перезапустите сервер.');
    }
    const stderr = error.stderr;
    if (/private video|video is private|members[- ]only|join this channel|requires payment|premium/i.test(stderr)) {
      return new AppError('VIDEO_PRIVATE', 'Видео приватное или доступно только по подписке — его нельзя обработать.', stderr);
    }
    if (/sign in to confirm your age|age[- ]restricted|inappropriate for some users/i.test(stderr)) {
      return new AppError('VIDEO_PRIVATE', 'Видео с возрастным ограничением требует входа в аккаунт — обработать его нельзя.', stderr);
    }
    if (/ConnectionResetError|Connection aborted|Connection refused|timed out|getaddrinfo|Network is unreachable|Unable to download (API|webpage)|SSL: |EOF occurred|RemoteDisconnected|10054|10060/i.test(stderr)) {
      return new AppError(
        'NETWORK_ERROR',
        'Сервер не может подключиться к сайту видео (соединение сбрасывается). Если YouTube открывается у вас только через VPN — включите VPN для всего компьютера, а не только в браузере, или укажите прокси VPN в файле server/.env (строка YTDLP_PROXY). Затем нажмите «Повторить».',
        stderr,
      );
    }
    if (/not a bot/i.test(stderr)) {
      return new AppError('VIDEO_UNAVAILABLE', 'YouTube временно ограничил доступ серверу (проверка «не бот»). Попробуйте позже или обновите yt-dlp.', stderr);
    }
    if (/video unavailable|has been removed|does not exist|not available|404|geo|blocked|no video formats/i.test(stderr)) {
      return new AppError('VIDEO_UNAVAILABLE', 'Видео недоступно: удалено, заблокировано в регионе или ссылка неверна.', stderr);
    }
    if (/ffmpeg|ffprobe/i.test(stderr) && /not found|not installed/i.test(stderr)) {
      return new AppError('FFMPEG_NOT_INSTALLED', 'Для скачивания аудио нужен ffmpeg. Установите его (см. README).', stderr);
    }
    const lastLine = stderr.trim().split('\n').filter((l) => l.includes('ERROR')).pop() ?? stderr.trim().split('\n').pop() ?? '';
    return new TranscriptionError(`Не удалось ${action}: ${lastLine.replace(/^ERROR:\s*/, '').slice(0, 300)}`, stderr);
  }
  return new TranscriptionError(`Не удалось ${action}`, String(error));
}

export class YtDlpAdapter implements IVideoInfoProvider, IAudioDownloader {
  private jsRuntimeSupported: Promise<boolean> | null = null;

  constructor(
    private readonly config: YtDlpConfig,
    private readonly logger: ILogger,
  ) {}

  async getInfo(url: string): Promise<VideoInfo> {
    try {
      const { stdout } = await this.run(['--dump-single-json', '--skip-download', url], 120_000);
      const raw = JSON.parse(stdout) as Record<string, unknown>;
      return {
        id: String(raw['id'] ?? ''),
        title: String(raw['title'] ?? raw['fulltitle'] ?? ''),
        duration: typeof raw['duration'] === 'number' ? raw['duration'] : 0,
        language: typeof raw['language'] === 'string' ? raw['language'] : null,
        subtitles: (raw['subtitles'] as Record<string, unknown[]> | null) ?? {},
        automaticCaptions: (raw['automatic_captions'] as Record<string, unknown[]> | null) ?? {},
      };
    } catch (error) {
      throw error instanceof SyntaxError ? new TranscriptionError('yt-dlp вернул некорректный ответ') : classify(error, 'получить информацию о видео');
    }
  }

  /** yt-dlp --write-auto-sub --skip-download; возвращает путь к файлу субтитров или null. */
  async downloadSubtitles(url: string, track: SubtitleTrack, workDir: string): Promise<string | null> {
    const prefix = `subs-${track.auto ? 'auto' : 'manual'}`;
    try {
      await this.run(
        [
          '--skip-download',
          track.auto ? '--write-auto-subs' : '--write-subs',
          '--sub-langs',
          track.key,
          '--sub-format',
          'vtt/srt/best',
          '-o',
          join(workDir, `${prefix}.%(ext)s`),
          url,
        ],
        120_000,
      );
    } catch (error) {
      this.logger.warn({ track, err: error instanceof CommandError ? error.stderr.slice(-500) : String(error) }, 'subtitle download failed');
      return null;
    }
    const files = await readdir(workDir);
    const file = files.find((f) => f.startsWith(prefix) && /\.(vtt|srt)$/i.test(f));
    return file ? join(workDir, file) : null;
  }

  async download(url: string, workDir: string): Promise<string> {
    try {
      await this.run(
        [
          '-f',
          'bestaudio/best',
          '-x',
          '--audio-format',
          'mp3',
          // Моно 16 кГц 32 кбит/с: ~14 МБ на час — укладывается в лимит Whisper 25 МБ
          '--postprocessor-args',
          'ExtractAudio:-ac 1 -ar 16000 -b:a 32k',
          '-o',
          join(workDir, 'audio.%(ext)s'),
          url,
        ],
        3 * 60 * 60 * 1000,
      );
    } catch (error) {
      throw classify(error, 'скачать аудио');
    }
    const file = (await readdir(workDir)).find((f) => f.startsWith('audio.'));
    if (!file) throw new TranscriptionError('yt-dlp не сохранил аудиофайл');
    return join(workDir, file);
  }

  async version(): Promise<string | null> {
    try {
      return (await runCommand(this.config.bin, ['--version'], { timeoutMs: 15_000 })).stdout.trim();
    } catch {
      return null;
    }
  }

  private async baseArgs(): Promise<string[]> {
    const args = ['--no-playlist', '--no-warnings', '--no-progress', '--retries', '2', '--extractor-retries', '1', '--socket-timeout', '20'];
    if (this.config.proxy) args.push('--proxy', this.config.proxy);
    if (this.config.ffmpegPath) args.push('--ffmpeg-location', this.config.ffmpegPath);
    if (this.config.useNodeJsRuntime && (await this.supportsJsRuntimes())) args.push('--js-runtimes', `node:${process.execPath}`);
    return [...args, ...this.config.extraArgs];
  }

  private supportsJsRuntimes(): Promise<boolean> {
    this.jsRuntimeSupported ??= runCommand(this.config.bin, ['--help'], { timeoutMs: 15_000 })
      .then(({ stdout }) => stdout.includes('--js-runtimes'))
      .catch(() => false);
    return this.jsRuntimeSupported;
  }

  private async run(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    const fullArgs = [...(await this.baseArgs()), ...args];
    const started = Date.now();
    this.logger.debug({ args: fullArgs }, 'yt-dlp start');
    const result = await runCommand(this.config.bin, fullArgs, { timeoutMs });
    this.logger.debug({ ms: Date.now() - started }, 'yt-dlp done');
    return result;
  }
}
