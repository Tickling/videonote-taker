import { SubtitlesNotFoundError, TranscriptionError } from '@domain/errors';
import type { ILogger } from '@domain/ports/ILogger';
import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { injectContentScripts } from '../../messaging/injectContentScripts';
import type { ContentCommand } from '../../messaging/messages';
import { CaptionsFetchError, NoCaptionsError, fetchWatchHtml, transcriptFromWatchHtml, type YouTubeTranscript } from './youtubeCaptions';

type CaptionsReply = { ok: true; transcript: YouTubeTranscript } | { ok: false; reason: 'no_captions' | 'failed'; message: string };

const YOUTUBE_TABS = ['https://www.youtube.com/*', 'https://youtube.com/*', 'https://m.youtube.com/*'];

function toResult(t: YouTubeTranscript, fallbackLanguage: string): TranscriptionResult {
  const segments = t.segments.map((s, i) => ({
    id: `y${i}`,
    text: s.text,
    start: Timestamp.of(s.start),
    end: Timestamp.of(Math.max(s.start, s.end)),
    confidence: 1,
  }));
  const last = t.segments[t.segments.length - 1];
  return {
    segments,
    source: 'subtitles',
    totalDuration: Math.max(t.duration, last?.end ?? 0),
    language: t.language || fallbackLanguage,
    ...(t.title ? { title: t.title } : {}),
  };
}

/**
 * Субтитры YouTube прямо из браузера: запросы идут из вкладки YouTube (или из расширения),
 * то есть через VPN/прокси браузера — сервер для этого не нужен.
 */
export class BrowserYouTubeSubtitlesAdapter {
  constructor(private readonly logger: ILogger) {}

  async transcribe(videoUrl: VideoUrl, language: string): Promise<TranscriptionResult> {
    const videoId = videoUrl.getVideoId();
    const problems: string[] = [];
    const reply = await this.viaTab(videoUrl, videoId, language);
    if (reply) {
      if (reply.ok) {
        this.logger.info('youtube captions from tab', { method: reply.transcript.method, segments: reply.transcript.segments.length });
        return toResult(reply.transcript, language);
      }
      if (reply.reason === 'no_captions') throw new NoCaptionsError();
      this.logger.warn('tab captions failed, trying from extension', { message: reply.message });
      problems.push(`вкладка — ${reply.message}`);
    } else {
      problems.push('вкладка YouTube не найдена');
    }
    try {
      const html = await fetchWatchHtml(videoId, language, (input, init) => fetch(input, init));
      const transcript = await transcriptFromWatchHtml(html, language, (input, init) => fetch(input, init));
      this.logger.info('youtube captions from extension', { method: transcript.method, segments: transcript.segments.length });
      return toResult(transcript, language);
    } catch (error) {
      if (error instanceof NoCaptionsError) throw error;
      problems.push(`расширение — ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new CaptionsFetchError(problems.join(' | '));
  }

  /** Вкладка с этим видео (лучше всего — плеер может отдать субтитры сам) или любая вкладка YouTube. */
  private async viaTab(videoUrl: VideoUrl, videoId: string, language: string): Promise<CaptionsReply | null> {
    let tabs: chrome.tabs.Tab[] = [];
    try {
      tabs = await chrome.tabs.query({ url: YOUTUBE_TABS });
    } catch {
      return null;
    }
    const sameVideo = tabs.find((t) => t.url && VideoUrl.tryCreate(t.url)?.equals(videoUrl));
    const target = sameVideo ?? tabs.find((t) => t.status === 'complete');
    if (target?.id === undefined) return null;
    const ask = async (tabId: number): Promise<CaptionsReply | null> =>
      ((await chrome.tabs.sendMessage(tabId, { type: 'extract-youtube-captions', videoId, language } satisfies ContentCommand)) as CaptionsReply | undefined) ?? null;
    try {
      return await ask(target.id);
    } catch (error) {
      // Вкладка открыта до установки/обновления расширения — подключаемся к ней и спрашиваем снова
      this.logger.warn('no content script in youtube tab, injecting', { error: String(error) });
      try {
        await injectContentScripts(target.id);
        await new Promise((r) => setTimeout(r, 300));
        return await ask(target.id);
      } catch (retryError) {
        this.logger.warn('content script injection failed', { error: String(retryError) });
        return null;
      }
    }
  }
}

/** YouTube: сначала браузер (работает через VPN браузера), затем сервер. Остальные сайты — сервер. */
export class PreferBrowserSubtitlesAdapter implements ITranscriptionService {
  constructor(
    private readonly browser: BrowserYouTubeSubtitlesAdapter,
    private readonly backend: ITranscriptionService,
    private readonly logger: ILogger,
    /** Отдавать YouTube серверу, если браузер не справился (по умолчанию нет: сервер YouTube обычно блокирует) */
    private readonly youtubeViaServer = false,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!input.videoUrl) throw new TranscriptionError('Субтитры доступны только для ссылки на видео');
    if (input.videoUrl.getPlatform() !== VideoPlatform.YOUTUBE) return this.backend.transcribe(input);

    input.onProgress?.({ progress: 10, stage: 'Загружаем субтитры YouTube…' });
    try {
      const result = await this.browser.transcribe(input.videoUrl, input.language);
      if (result.segments.length > 0) {
        input.onProgress?.({ progress: 100, stage: 'Субтитры получены' });
        return result;
      }
    } catch (error) {
      if (error instanceof NoCaptionsError) throw new SubtitlesNotFoundError();
      const details = error instanceof Error ? error.message : String(error);
      this.logger.warn('browser captions failed', { error: details });
      if (!this.youtubeViaServer) {
        throw new TranscriptionError(
          `Не удалось получить субтитры YouTube. Обновите страницу видео (F5), дождитесь, пока оно начнёт играть, и нажмите «Повторить». Если не поможет — пришлите разработчику эту строку: ${details}`,
        );
      }
    }
    return this.backend.transcribe(input);
  }
}
