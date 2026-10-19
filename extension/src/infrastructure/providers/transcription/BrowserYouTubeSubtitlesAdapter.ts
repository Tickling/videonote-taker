import { SubtitlesNotFoundError, TranscriptionError } from '@domain/errors';
import type { ILogger } from '@domain/ports/ILogger';
import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
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
    const reply = await this.viaTab(videoUrl, videoId, language);
    if (reply) {
      if (reply.ok) {
        this.logger.info('youtube captions from tab', { method: reply.transcript.method, segments: reply.transcript.segments.length });
        return toResult(reply.transcript, language);
      }
      if (reply.reason === 'no_captions') throw new NoCaptionsError();
      this.logger.warn('tab captions failed, trying from extension', { message: reply.message });
    }
    const html = await fetchWatchHtml(videoId, language, (input, init) => fetch(input, init));
    const transcript = await transcriptFromWatchHtml(html, language, (input, init) => fetch(input, init));
    this.logger.info('youtube captions from extension', { method: transcript.method, segments: transcript.segments.length });
    return toResult(transcript, language);
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
    try {
      const reply = (await chrome.tabs.sendMessage(target.id, { type: 'extract-youtube-captions', videoId, language } satisfies ContentCommand)) as CaptionsReply | undefined;
      return reply ?? null;
    } catch (error) {
      this.logger.warn('no content script in youtube tab', { error: String(error) });
      return null;
    }
  }
}

/** YouTube: сначала браузер (работает через VPN браузера), затем сервер. Остальные сайты — сервер. */
export class PreferBrowserSubtitlesAdapter implements ITranscriptionService {
  constructor(
    private readonly browser: BrowserYouTubeSubtitlesAdapter,
    private readonly backend: ITranscriptionService,
    private readonly logger: ILogger,
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
      this.logger.warn('browser captions failed, falling back to server', {
        error: error instanceof CaptionsFetchError ? error.message : String(error),
      });
    }
    return this.backend.transcribe(input);
  }
}
