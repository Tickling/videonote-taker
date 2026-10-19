// Нарезка аудиопотока на самостоятельные фрагменты (каждый — валидный webm-файл).

export interface RecordedChunk {
  seq: number;
  audioBase64: string;
  mimeType: string;
}

export interface ChunkedRecorderEvents {
  onChunkStart: (seq: number) => void;
  onChunk: (chunk: RecordedChunk) => void;
  onError: (message: string) => void;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < buffer.length; i += step) {
    binary += String.fromCharCode(...buffer.subarray(i, i + step));
  }
  return btoa(binary);
}

export class ChunkedRecorder {
  private active = false;
  private seq = 0;
  private current: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly mimeType: string;

  constructor(
    private readonly stream: MediaStream,
    private readonly chunkSeconds: number,
    private readonly events: ChunkedRecorderEvents,
  ) {
    this.mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.next();
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.current?.state === 'recording') this.current.stop();
  }

  private next(): void {
    if (!this.active) return;
    const audioOnly = new MediaStream(this.stream.getAudioTracks());
    if (audioOnly.getAudioTracks().length === 0) {
      this.events.onError('В потоке нет звука');
      this.active = false;
      return;
    }
    const seq = this.seq++;
    const parts: Blob[] = [];
    const recorder = new MediaRecorder(audioOnly, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    recorder.onerror = () => this.events.onError('Ошибка записи звука');
    recorder.onstop = () => {
      const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
      // Новый фрагмент начинаем сразу, кодирование предыдущего — параллельно
      this.next();
      if (blob.size < 2000) return; // пустой фрагмент
      void blobToBase64(blob).then((audioBase64) =>
        this.events.onChunk({ seq, audioBase64, mimeType: blob.type.split(';')[0] ?? 'audio/webm' }),
      );
    };
    this.events.onChunkStart(seq);
    recorder.start();
    this.timer = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, this.chunkSeconds * 1000);
  }
}
