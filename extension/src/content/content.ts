// Content script: кнопка и sidebar на страницах YouTube / Rutube / VK Видео, скриншоты, запись звука из <video>.
import { CaptureScreenshotUseCase } from '@application/useCases/CaptureScreenshotUseCase';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { CanvasScreenshotAdapter } from '@infrastructure/adapters/CanvasScreenshotAdapter';
import { ChromeStorageNoteRepository, ChromeStorageSettingsRepository } from '@infrastructure/adapters/ChromeStorageAdapter';
import { ConsoleLogger } from '@infrastructure/logging/ConsoleLogger';
import {
  sendToBackground,
  type AudioChunkMessage,
  type ContentCommand,
  type VideoState,
} from '@infrastructure/messaging/messages';
import { ChunkedRecorder } from './chunkedRecorder';
import { extractYouTubeCaptions } from './youtubeCaptions';
import { findMainVideo, pageTitle } from './videoDetector';

const log = new ConsoleLogger('content');
const settings = new ChromeStorageSettingsRepository();
const notes = new ChromeStorageNoteRepository();
const capture = new CaptureScreenshotUseCase(
  new CanvasScreenshotAdapter(() => sendToBackground<string>({ type: 'capture-visible-tab' })),
  notes,
  log,
);

const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL('/')).origin;
const SIDEBAR_WIDTH = 420;

// ---------- UI на странице (в Shadow DOM, чтобы стили сайта не мешали) ----------
const host = document.createElement('div');
host.id = 'videonote-taker-root';
host.style.cssText = 'all: initial; position: fixed; z-index: 2147483646; top: 0; right: 0;';
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `
<style>
  .launcher { position: fixed; right: 18px; bottom: 90px; width: 48px; height: 48px; border-radius: 14px; border: none;
    background: linear-gradient(135deg,#f43f5e,#f97316); box-shadow: 0 6px 20px rgba(0,0,0,.3); cursor: pointer;
    display: none; align-items: center; justify-content: center; transition: transform .15s; }
  .launcher:hover { transform: scale(1.08); }
  .launcher img { width: 30px; height: 30px; }
  .panel { position: fixed; top: 0; right: 0; height: 100vh; width: ${SIDEBAR_WIDTH}px; max-width: 100vw; border: none;
    box-shadow: -8px 0 24px rgba(0,0,0,.25); background: #fff; display: none; color-scheme: light; }
  .toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); background: #0f172a; color: #fff;
    font: 14px/1.4 system-ui, sans-serif; padding: 10px 16px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.3);
    opacity: 0; transition: opacity .2s; pointer-events: none; }
  .toast.show { opacity: 1; }
</style>
<button class="launcher" title="VideoNote Taker — конспект видео"><img alt="" /></button>
<iframe class="panel" title="VideoNote Taker" allow="clipboard-write"></iframe>
<div class="toast"></div>`;

const launcher = shadow.querySelector<HTMLButtonElement>('.launcher');
const panel = shadow.querySelector<HTMLIFrameElement>('.panel');
const toastEl = shadow.querySelector<HTMLDivElement>('.toast');
const launcherImg = shadow.querySelector<HTMLImageElement>('.launcher img');
if (launcherImg) launcherImg.src = chrome.runtime.getURL('icons/icon-48.png');

let sidebarOpen = false;
let tabId: number | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function toast(text: string): void {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function isVideoPage(): boolean {
  return VideoUrl.isSupported(location.href);
}

function postToSidebar(message: Record<string, unknown>): void {
  panel?.contentWindow?.postMessage({ source: 'vnt-content', ...message }, EXTENSION_ORIGIN);
}

function pageInfo(): Record<string, unknown> {
  return { type: 'page', url: location.href, title: pageTitle() };
}

async function openSidebar(tab?: string): Promise<void> {
  if (!panel || !isVideoPage()) return;
  if (!panel.src) {
    tabId ??= await sendToBackground<number | null>({ type: 'get-tab-id' }).catch(() => null);
    const params = new URLSearchParams({ tabId: String(tabId ?? -1), url: location.href, title: pageTitle() });
    if (tab) params.set('tab', tab);
    panel.src = chrome.runtime.getURL(`src/ui/sidebar/index.html?${params}`);
  } else if (tab) {
    postToSidebar({ type: 'show-tab', tab });
  }
  panel.style.display = 'block';
  if (launcher) launcher.style.display = 'none';
  sidebarOpen = true;
}

function closeSidebar(): void {
  if (!panel) return;
  panel.style.display = 'none';
  sidebarOpen = false;
  updateLauncher();
}

function updateLauncher(): void {
  if (launcher) launcher.style.display = isVideoPage() && !sidebarOpen ? 'flex' : 'none';
}

launcher?.addEventListener('click', () => void openSidebar());

// ---------- Скриншоты ----------
async function takeScreenshot(): Promise<void> {
  if (!isVideoPage()) {
    toast('Откройте страницу с видео, чтобы сделать скриншот');
    return;
  }
  const s = await settings.get();
  try {
    // Прячем свою панель, чтобы она не попала в снимок вкладки
    const wasOpen = sidebarOpen;
    host.style.visibility = 'hidden';
    const { screenshot } = await capture.execute({
      pageUrl: location.href,
      title: pageTitle(),
      video: findMainVideo(),
      defaultVideoType: s.defaultVideoType,
      defaultLanguage: s.defaultLanguage,
    });
    host.style.visibility = 'visible';
    toast(`📸 Скриншот ${screenshot.timestamp.format()} сохранён`);
    if (wasOpen) postToSidebar({ type: 'show-tab', tab: 'screenshots' });
  } catch (error) {
    host.style.visibility = 'visible';
    log.error('screenshot failed', { error: String(error) });
    toast(error instanceof Error ? error.message : 'Не удалось сделать скриншот');
  }
}

// ---------- Запись звука прямо из <video> (фоллбэк, если tabCapture недоступен) ----------
type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };
let elementRecorder: ChunkedRecorder | null = null;

function startElementRecording(chunkSeconds: number): void {
  const video = findMainVideo() as CapturableVideo | null;
  if (!video?.captureStream) throw new Error('Не найдено видео для записи');
  const stream = video.captureStream();
  const startTimes = new Map<number, number>();
  elementRecorder?.stop();
  elementRecorder = new ChunkedRecorder(stream, chunkSeconds, {
    onChunkStart: (seq) => startTimes.set(seq, video.currentTime),
    onChunk: (chunk) => {
      const videoTime = startTimes.get(chunk.seq) ?? 0;
      startTimes.delete(chunk.seq);
      void chrome.runtime.sendMessage({ type: 'realtime-chunk', tabId: tabId ?? -1, videoTime, ...chunk } satisfies AudioChunkMessage);
    },
    onError: (message) => void chrome.runtime.sendMessage({ type: 'realtime-error', tabId: tabId ?? -1, message }),
  });
  elementRecorder.start();
}

// ---------- Сообщения ----------
function videoState(): VideoState {
  const video = findMainVideo();
  return {
    url: location.href,
    title: pageTitle(),
    currentTime: video?.currentTime ?? 0,
    paused: video?.paused ?? true,
    duration: Number.isFinite(video?.duration) ? (video?.duration ?? 0) : 0,
    hasVideo: video !== null,
  };
}

chrome.runtime.onMessage.addListener((message: ContentCommand, _sender, sendResponse) => {
  switch (message.type) {
    case 'take-screenshot':
      void takeScreenshot();
      return false;
    case 'toggle-sidebar':
      if (sidebarOpen) closeSidebar();
      else void openSidebar();
      return false;
    case 'get-video-state':
      sendResponse(videoState());
      return false;
    case 'start-element-recording':
      void sendToBackground<number | null>({ type: 'get-tab-id' })
        .then((id) => {
          tabId = id;
          startElementRecording(message.chunkSeconds);
        })
        .catch((error: unknown) => {
          log.error('element recording failed', { error: String(error) });
          void chrome.runtime.sendMessage({
            type: 'realtime-error',
            tabId: tabId ?? -1,
            message: error instanceof Error ? error.message : 'Не удалось начать запись',
          });
        });
      sendResponse(true);
      return false;
    case 'extract-youtube-captions':
      void extractYouTubeCaptions(message.videoId, message.language).then(sendResponse);
      return true; // ответ асинхронный
    case 'stop-element-recording':
      elementRecorder?.stop();
      elementRecorder = null;
      return false;
  }
});

interface SidebarMessage {
  source: 'vnt-sidebar';
  type: 'ready' | 'close' | 'seek' | 'screenshot' | 'play-pause';
  seconds?: number;
}

window.addEventListener('message', (event: MessageEvent<SidebarMessage>) => {
  if (event.origin !== EXTENSION_ORIGIN || event.data?.source !== 'vnt-sidebar') return;
  const video = findMainVideo();
  switch (event.data.type) {
    case 'ready':
      postToSidebar(pageInfo());
      break;
    case 'close':
      closeSidebar();
      break;
    case 'seek':
      if (video && typeof event.data.seconds === 'number') {
        video.currentTime = event.data.seconds;
        void video.play().catch(() => undefined);
      }
      break;
    case 'screenshot':
      void takeScreenshot();
      break;
    case 'play-pause':
      if (video) {
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      }
      break;
  }
});

// ---------- SPA-навигация (YouTube/VK меняют URL без перезагрузки) ----------
let lastUrl = location.href;
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  updateLauncher();
  if (!isVideoPage()) closeSidebar();
  // Заголовок страницы обновляется с задержкой
  setTimeout(() => postToSidebar(pageInfo()), 1200);
}, 800);

function mount(): void {
  // Кнопка от прошлой версии расширения (после обновления) больше не работает — заменяем
  document.getElementById(host.id)?.remove();
  (document.body ?? document.documentElement).appendChild(host);
  updateLauncher();
  log.info('mounted', { host: location.hostname, videoPage: isVideoPage() });
}

mount();
