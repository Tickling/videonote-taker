import { TranscriptionError } from '@domain/errors';
import { TranscriptionProvider } from '@domain/valueObjects/Providers';
import type { VideoType } from '@domain/valueObjects/VideoType';
import type { createBackgroundContainer } from '@infrastructure/container';
import {
  realtimeKey,
  type AudioChunkMessage,
  type ContentCommand,
  type OffscreenCommand,
  type RealtimeState,
  type VideoState,
} from '@infrastructure/messaging/messages';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';

type Container = ReturnType<typeof createBackgroundContainer>;

const CHUNK_SECONDS = 15;
const OFFSCREEN_URL = 'src/offscreen/index.html';

interface Session {
  tabId: number;
  noteId: string;
  pageUrl: string;
  title: string;
  language: string;
  videoType: VideoType;
  method: 'tabCapture' | 'videoElement';
  chunkStarts: Map<number, VideoState | null>;
  queue: Promise<void>;
  chunks: number;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Real-time транскрибация: tabCapture → offscreen MediaRecorder → Whisper. */
export class RealtimeController {
  private readonly sessions = new Map<number, Session>();

  constructor(private readonly c: Container) {}

  async start(params: { tabId: number; pageUrl: string; title: string; language: string; videoType: VideoType }): Promise<RealtimeState> {
    const settings = await this.c.settings.get();
    const whisperReady =
      (settings.transcriptionProvider === TranscriptionProvider.OPENAI_WHISPER && settings.openaiApiKey) ||
      settings.transcriptionProvider === TranscriptionProvider.LOCAL_WHISPER;
    if (!whisperReady) {
      throw new TranscriptionError(
        'Для записи в реальном времени нужен Whisper: в настройках ⚙️ включите «OpenAI Whisper» и добавьте ключ (или настройте локальный Whisper). Для обычного конспекта по субтитрам запись не нужна — нажмите «Создать конспект».',
        'MISSING_API_KEY',
      );
    }
    if (this.sessions.has(params.tabId)) await this.stop(params.tabId);

    const noteId = new VideoUrl(params.pageUrl).getKey();
    let method: Session['method'] = 'tabCapture';
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: params.tabId });
      await this.ensureOffscreen();
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'start-recording',
        tabId: params.tabId,
        streamId,
        chunkSeconds: CHUNK_SECONDS,
      } satisfies OffscreenCommand);
    } catch (error) {
      // tabCapture требует явного вызова расширения на вкладке — пробуем захват звука из <video>
      this.c.logger.warn('tabCapture unavailable, using video element', { error: String(error) });
      method = 'videoElement';
      await chrome.tabs.sendMessage(params.tabId, { type: 'start-element-recording', chunkSeconds: CHUNK_SECONDS } satisfies ContentCommand);
    }

    this.sessions.set(params.tabId, {
      ...params,
      noteId,
      method,
      chunkStarts: new Map(),
      queue: Promise.resolve(),
      chunks: 0,
    });
    return this.setState({ tabId: params.tabId, noteId, status: 'recording', method, chunks: 0 });
  }

  async stop(tabId: number): Promise<void> {
    const session = this.sessions.get(tabId);
    this.sessions.delete(tabId);
    if (!session) {
      await chrome.storage.local.remove(realtimeKey(tabId));
      return;
    }
    if (session.method === 'tabCapture') {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording', tabId } satisfies OffscreenCommand).catch(() => undefined);
      if (this.sessions.size === 0) await chrome.offscreen.closeDocument().catch(() => undefined);
    } else {
      await chrome.tabs.sendMessage(tabId, { type: 'stop-element-recording' } satisfies ContentCommand).catch(() => undefined);
    }
    await session.queue.catch(() => undefined);
    await this.setState({ tabId, noteId: session.noteId, status: 'stopped', method: session.method, chunks: session.chunks });
  }

  async onChunkStart(tabId: number, seq: number): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) return;
    session.chunkStarts.set(seq, await this.videoState(tabId));
  }

  onChunk(message: AudioChunkMessage): void {
    const session = this.sessions.get(message.tabId);
    if (!session) return;
    session.queue = session.queue.then(() => this.processChunk(session, message));
  }

  async onError(tabId: number, message: string): Promise<void> {
    const session = this.sessions.get(tabId);
    this.sessions.delete(tabId);
    await this.setState({ tabId, noteId: session?.noteId ?? '', status: 'error', chunks: session?.chunks ?? 0, error: message });
  }

  private async processChunk(session: Session, message: AudioChunkMessage): Promise<void> {
    const startState = session.chunkStarts.get(message.seq) ?? null;
    session.chunkStarts.delete(message.seq);
    const now = await this.videoState(session.tabId);
    // Видео стояло на паузе весь фрагмент — там тишина, Whisper на ней «галлюцинирует»
    if (startState?.paused && now?.paused) return;
    const videoTime = message.videoTime ?? startState?.currentTime ?? Math.max(0, (now?.currentTime ?? CHUNK_SECONDS) - CHUNK_SECONDS);
    // Если пользователь перешёл на другое видео — пишем в заметку нового
    const pageUrl = now?.url && VideoUrl.isSupported(now.url) ? now.url : session.pageUrl;

    try {
      await this.c.realtime.appendChunk({
        pageUrl,
        title: now?.title || session.title,
        audioBlob: base64ToBlob(message.audioBase64, message.mimeType),
        videoTime,
        language: session.language,
        videoType: session.videoType,
      });
      session.chunks += 1;
      if (this.sessions.has(session.tabId)) {
        await this.setState({ tabId: session.tabId, noteId: new VideoUrl(pageUrl).getKey(), status: 'recording', method: session.method, chunks: session.chunks });
      }
    } catch (error) {
      this.c.logger.error('realtime chunk failed', { error: String(error) });
      await this.setState({
        tabId: session.tabId,
        noteId: session.noteId,
        status: 'recording',
        method: session.method,
        chunks: session.chunks,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async videoState(tabId: number): Promise<VideoState | null> {
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'get-video-state' } satisfies ContentCommand)) as VideoState;
    } catch {
      return null;
    }
  }

  private async ensureOffscreen(): Promise<void> {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Запись звука вкладки для транскрибации в реальном времени',
    });
  }

  private async setState(state: Omit<RealtimeState, 'updatedAt'>): Promise<RealtimeState> {
    const full: RealtimeState = { ...state, updatedAt: Date.now() };
    await chrome.storage.local.set({ [realtimeKey(state.tabId)]: full });
    return full;
  }
}
