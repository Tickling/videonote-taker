// Content script: получение субтитров YouTube внутри страницы (запросы идут через VPN браузера).
import {
  CaptionsFetchError,
  NoCaptionsError,
  fetchWatchHtml,
  parseCaptionBody,
  transcriptFromWatchHtml,
  type YouTubeTranscript,
} from '@infrastructure/providers/transcription/youtubeCaptions';
import { findMainVideo, pageTitle } from './videoDetector';

export type CaptionsReply =
  | { ok: true; transcript: YouTubeTranscript }
  | { ok: false; reason: 'no_captions' | 'failed'; message: string };

interface Captured {
  videoId: string;
  body: string;
}

let lastCaptured: Captured | null = null;
let lastCapturedUrl = '';

function lastCapturedLanguage(): string {
  try {
    return new URL(lastCapturedUrl, location.origin).searchParams.get('lang')?.split('-')[0] ?? '';
  } catch {
    return '';
  }
}
const waiters = new Set<(c: Captured) => void>();

function videoIdFromUrl(url: string): string | null {
  try {
    return new URL(url, location.origin).searchParams.get('v');
  } catch {
    return null;
  }
}

window.addEventListener('message', (event: MessageEvent<{ source?: string; type?: string; url?: string; body?: string }>) => {
  if (event.source !== window || event.data?.source !== 'vnt-main' || event.data.type !== 'timedtext') return;
  const videoId = event.data.url ? videoIdFromUrl(event.data.url) : null;
  if (!videoId || !event.data.body) return;
  lastCaptured = { videoId, body: event.data.body };
  lastCapturedUrl = event.data.url ?? '';
  for (const resolve of waiters) resolve(lastCaptured);
});

function waitForCapture(videoId: string, timeoutMs: number): Promise<Captured | null> {
  if (lastCaptured?.videoId === videoId) return Promise.resolve(lastCaptured);
  return new Promise((resolve) => {
    const done = (c: Captured | null): void => {
      waiters.delete(handler);
      clearTimeout(timer);
      resolve(c);
    };
    const handler = (c: Captured): void => {
      if (c.videoId === videoId) done(c);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    waiters.add(handler);
  });
}

/** Способ 3: на секунду включаем субтитры в плеере и забираем то, что он загрузил. */
async function captureFromPlayer(videoId: string): Promise<YouTubeTranscript | null> {
  const button = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
  let toggled = false;
  if (!lastCaptured || lastCaptured.videoId !== videoId) {
    if (!button || button.getAttribute('aria-disabled') === 'true' || button.style.display === 'none') return null;
    if (button.getAttribute('aria-pressed') !== 'true') {
      button.click();
      toggled = true;
    }
  }
  const captured = await waitForCapture(videoId, 8000);
  if (toggled && button?.getAttribute('aria-pressed') === 'true') button.click();
  if (!captured) return null;
  const segments = parseCaptionBody(captured.body);
  if (segments.length === 0) return null;
  const video = findMainVideo();
  return {
    title: pageTitle(),
    duration: Number.isFinite(video?.duration) ? (video?.duration ?? 0) : 0,
    language: lastCapturedLanguage(),
    segments,
    method: 'player-capture',
  };
}

export async function extractYouTubeCaptions(videoId: string, language: string): Promise<CaptionsReply> {
  let noCaptions = false;
  let lastError = '';
  try {
    const html = await fetchWatchHtml(videoId, language, (input, init) => fetch(input, init));
    return { ok: true, transcript: await transcriptFromWatchHtml(html, language, (input, init) => fetch(input, init)) };
  } catch (error) {
    if (error instanceof NoCaptionsError) noCaptions = true;
    lastError = error instanceof Error ? error.message : String(error);
  }
  // Плеер — только для видео, открытого на этой вкладке
  if (videoIdFromUrl(location.href) === videoId) {
    try {
      const captured = await captureFromPlayer(videoId);
      if (captured) return { ok: true, transcript: captured };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (noCaptions) return { ok: false, reason: 'no_captions', message: 'У этого видео нет субтитров' };
  return { ok: false, reason: 'failed', message: lastError || new CaptionsFetchError('Не удалось получить субтитры').message };
}
