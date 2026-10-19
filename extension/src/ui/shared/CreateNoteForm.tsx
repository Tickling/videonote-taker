import { Mic, Sparkles, Square } from 'lucide-react';
import type { VideoType } from '@domain/valueObjects/VideoType';
import type { RealtimeState, TaskState } from '@infrastructure/messaging/messages';
import { Button, ErrorBanner, LanguageSelect, ProgressBar, VideoTypeSelector } from './components';

interface Props {
  videoType: VideoType;
  onVideoTypeChange: (v: VideoType) => void;
  language: string;
  onLanguageChange: (v: string) => void;
  onCreate: () => void;
  canCreate: boolean;
  hasNote: boolean;
  task: TaskState | null;
  startError: { code: string; message: string } | null;
  realtime?: { state: RealtimeState | null; onStart: () => void; onStop: () => void; available: boolean };
  compact?: boolean;
}

/** Общий блок: тип видео, язык, «Создать конспект», прогресс и ошибки. */
export function CreateNoteForm(p: Props) {
  const running = p.task?.status === 'running';
  const recording = p.realtime?.state?.status === 'recording';
  const error = p.startError ?? (p.task?.status === 'failed' ? p.task.error ?? null : null);
  return (
    <div className="space-y-3">
      <VideoTypeSelector value={p.videoType} onChange={p.onVideoTypeChange} {...(p.compact ? { compact: true } : {})} />
      <div className="flex gap-2">
        <LanguageSelect value={p.language} onChange={p.onLanguageChange} className="w-32" />
        <Button variant="primary" className="flex-1" onClick={p.onCreate} disabled={!p.canCreate || running}>
          <Sparkles size={16} /> {p.hasNote ? 'Обновить конспект' : 'Создать конспект'}
        </Button>
      </div>
      {p.realtime?.available && (
        <Button
          className="w-full"
          variant={recording ? 'danger' : 'secondary'}
          onClick={recording ? p.realtime.onStop : p.realtime.onStart}
          title="Транскрибация звука вкладки в реальном времени через Whisper"
        >
          {recording ? (
            <>
              <Square size={14} /> Остановить запись · {p.realtime.state?.chunks ?? 0} фрагм.
            </>
          ) : (
            <>
              <Mic size={14} /> Запись в реальном времени (Whisper)
            </>
          )}
        </Button>
      )}
      {recording && (
        <p className="flex items-center gap-2 text-xs text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Идёт запись — текст появляется на вкладке «Транскрипт» каждые ~15 сек.
        </p>
      )}
      {p.realtime?.state?.error && <ErrorBanner error={{ code: 'REALTIME', message: p.realtime.state.error }} />}
      {running && p.task && <ProgressBar progress={p.task.progress} stage={p.task.stage} />}
      {error && <ErrorBanner error={error} onRetry={p.onCreate} />}
      {p.task?.status === 'completed' && p.task.warning && <ErrorBanner tone="warning" error={p.task.warning} />}
    </div>
  );
}
