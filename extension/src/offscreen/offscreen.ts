// Offscreen-документ: держит аудиопоток вкладки (tabCapture) и режет его на фрагменты.
import type { OffscreenCommand, OffscreenEvent } from '@infrastructure/messaging/messages';
import { ChunkedRecorder } from '../content/chunkedRecorder';

interface ChromeTabConstraints {
  mandatory: { chromeMediaSource: 'tab'; chromeMediaSourceId: string };
}

const recorders = new Map<number, { recorder: ChunkedRecorder; stream: MediaStream; ctx: AudioContext }>();

function emit(event: OffscreenEvent): void {
  void chrome.runtime.sendMessage(event);
}

async function start(tabId: number, streamId: string, chunkSeconds: number): Promise<void> {
  const constraints: ChromeTabConstraints = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: constraints as unknown as MediaTrackConstraints,
    video: false,
  });
  // tabCapture глушит вкладку — возвращаем звук пользователю
  const ctx = new AudioContext();
  ctx.createMediaStreamSource(stream).connect(ctx.destination);

  const recorder = new ChunkedRecorder(stream, chunkSeconds, {
    onChunkStart: (seq) => emit({ type: 'realtime-chunk-start', tabId, seq }),
    onChunk: (chunk) => emit({ type: 'realtime-chunk', tabId, videoTime: null, ...chunk }),
    onError: (message) => emit({ type: 'realtime-error', tabId, message }),
  });
  recorders.set(tabId, { recorder, stream, ctx });
  recorder.start();
}

function stop(tabId: number): void {
  const entry = recorders.get(tabId);
  if (!entry) return;
  entry.recorder.stop();
  entry.stream.getTracks().forEach((t) => t.stop());
  void entry.ctx.close();
  recorders.delete(tabId);
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  const cmd = message as Partial<OffscreenCommand>;
  if (cmd.target !== 'offscreen' || cmd.tabId === undefined) return false;
  if (cmd.type === 'start-recording' && cmd.streamId && cmd.chunkSeconds) {
    start(cmd.tabId, cmd.streamId, cmd.chunkSeconds).catch((error: unknown) =>
      emit({ type: 'realtime-error', tabId: cmd.tabId ?? -1, message: `Не удалось захватить звук вкладки: ${String(error)}` }),
    );
  } else if (cmd.type === 'stop-recording') {
    stop(cmd.tabId);
  }
  return false;
});
