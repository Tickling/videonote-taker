// Service worker: координация задач, real-time записи, скриншотов и открытия гайдов.
import { createBackgroundContainer } from '@infrastructure/container';
import {
  STORAGE_KEYS,
  type BackgroundRequest,
  type BackgroundResponse,
  type ContentCommand,
  type GuideName,
  type OffscreenEvent,
} from '@infrastructure/messaging/messages';
import { injectContentScripts } from '@infrastructure/messaging/injectContentScripts';
import { RealtimeController } from './realtime';
import { TaskRunner, toErrorPayload } from './taskRunner';

const container = createBackgroundContainer();
const log = container.logger;
const tasks = new TaskRunner(container);
const realtime = new RealtimeController(container);

const GUIDES: Record<GuideName, string> = {
  groq: 'guides/groq-guide.pdf',
  openai: 'guides/openai-guide.pdf',
  'local-whisper': 'guides/local-whisper-guide.pdf',
};

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  log.info('installed', { reason });
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // Первая установка: сразу показываем настройки, чтобы добавить бесплатный ключ Groq
    await chrome.runtime.openOptionsPage();
  }
  // Вкладки YouTube, открытые до установки/обновления, получают скрипты расширения без F5
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
  for (const tab of tabs) {
    if (tab.id !== undefined) await injectContentScripts(tab.id).catch((error: unknown) => log.warn('inject failed', { tab: tab.id, error: String(error) }));
  }
  // Задачи, прерванные перезапуском service worker, помечаем как прерванные
  const all = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(STORAGE_KEYS.taskPrefix) || key.startsWith(STORAGE_KEYS.realtimePrefix)) {
      await chrome.storage.local.remove(key);
      log.debug('cleared stale state', { key, value: typeof value });
    }
  }
});

async function handle(message: BackgroundRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case 'create-note':
      return { noteId: await tasks.createNote(message) };
    case 'generate-summary':
      return { noteId: await tasks.generateSummary(message) };
    case 'capture-visible-tab': {
      const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
      return chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 85 });
    }
    case 'get-tab-id':
      return sender.tab?.id ?? null;
    case 'realtime-start':
      return realtime.start(message);
    case 'realtime-stop':
      await realtime.stop(message.tabId);
      return null;
    case 'open-guide':
      await chrome.tabs.create({ url: chrome.runtime.getURL(GUIDES[message.guide]) });
      return null;
    case 'open-settings':
      await chrome.runtime.openOptionsPage();
      return null;
    case 'download':
      return chrome.downloads.download({ url: message.dataUrl, filename: message.filename, conflictAction: 'uniquify' });
  }
}

function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  return typeof message === 'object' && message !== null && 'type' in message && !('target' in message);
}

function isOffscreenEvent(message: unknown): message is OffscreenEvent {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false;
  const type = (message as { type: unknown }).type;
  return type === 'realtime-chunk' || type === 'realtime-chunk-start' || type === 'realtime-error';
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isOffscreenEvent(message)) {
    if (message.type === 'realtime-chunk') realtime.onChunk(message);
    else if (message.type === 'realtime-chunk-start') void realtime.onChunkStart(message.tabId, message.seq);
    else void realtime.onError(message.tabId, message.message);
    return false;
  }
  if (!isBackgroundRequest(message)) return false;

  handle(message, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies BackgroundResponse))
    .catch((error: unknown) => {
      log.error('request failed', { type: message.type, error: String(error) });
      sendResponse({ ok: false, error: toErrorPayload(error) } satisfies BackgroundResponse);
    });
  return true; // ответ асинхронный
});

// Ctrl+Shift+S — скриншот кадра с привязкой к таймкоду
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'take-screenshot') return;
  const target = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!target?.id) return;
  try {
    await chrome.tabs.sendMessage(target.id, { type: 'take-screenshot' } satisfies ContentCommand);
  } catch (error) {
    log.warn('screenshot command: no content script on tab', { url: target.url, error: String(error) });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => void realtime.stop(tabId));
