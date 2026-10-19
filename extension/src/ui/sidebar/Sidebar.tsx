import { Camera } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { sendToBackground } from '@infrastructure/messaging/messages';
import { startCreateNote, startSummary } from '../shared/actions';
import { Button, GroqOnboarding, Header } from '../shared/components';
import { CreateNoteForm } from '../shared/CreateNoteForm';
import { useNote, useRealtime, useSettings, useTask } from '../shared/hooks';
import { NoteView, type NoteTab } from '../shared/NoteView';

const params = new URLSearchParams(location.search);
const TAB_ID = Number(params.get('tabId') ?? -1);

function postToPage(message: Record<string, unknown>): void {
  window.parent.postMessage({ source: 'vnt-sidebar', ...message }, '*');
}

function errorPayload(error: unknown): { code: string; message: string } {
  const e = error as Error & { code?: string };
  return { code: e.code ?? 'UNKNOWN', message: e.message };
}

export function Sidebar() {
  const { settings, loaded } = useSettings();
  const [page, setPage] = useState({ url: params.get('url') ?? '', title: params.get('title') ?? '' });
  const [tab, setTab] = useState<NoteTab>((params.get('tab') as NoteTab | null) ?? 'summary');
  const [videoType, setVideoType] = useState<VideoType | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ code: string; message: string } | null>(null);

  // Сообщения от content script: смена видео (SPA), переключение вкладки
  useEffect(() => {
    const listener = (event: MessageEvent<{ source?: string; type?: string; url?: string; title?: string; tab?: NoteTab }>): void => {
      if (event.source !== window.parent || event.data?.source !== 'vnt-content') return;
      if (event.data.type === 'page' && event.data.url) {
        setPage({ url: event.data.url, title: event.data.title ?? '' });
      }
      if (event.data.type === 'show-tab' && event.data.tab) setTab(event.data.tab);
    };
    window.addEventListener('message', listener);
    postToPage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);

  const videoUrl = useMemo(() => VideoUrl.tryCreate(page.url), [page.url]);
  const noteId = videoUrl?.getKey() ?? null;
  const { note } = useNote(noteId);
  const task = useTask(noteId);
  const realtime = useRealtime(TAB_ID);

  // Новое видео — сбрасываем локальный выбор
  useEffect(() => {
    setVideoType(null);
    setStartError(null);
  }, [noteId]);

  const vt = videoType ?? note?.videoType ?? settings.defaultVideoType;
  const lang = language ?? note?.language ?? settings.defaultLanguage;
  const seek = useCallback((seconds: number) => postToPage({ type: 'seek', seconds }), []);

  const create = (): void => {
    if (!videoUrl) return;
    setStartError(null);
    setTab('summary');
    startCreateNote({ url: videoUrl.value, language: lang, videoType: vt, title: page.title }).catch((e: unknown) => setStartError(errorPayload(e)));
  };

  if (!loaded) return null;
  return (
    <div className="flex h-screen flex-col bg-white">
      <Header
        title={page.title || 'VideoNote Taker'}
        onClose={() => postToPage({ type: 'close' })}
        extra={
          <Button size="sm" variant="ghost" onClick={() => postToPage({ type: 'screenshot' })} title="Скриншот кадра (Ctrl+Shift+S)">
            <Camera size={16} />
          </Button>
        }
      />
      <div className="space-y-3 border-b border-slate-100 p-4">
        {!settings.groqApiKey && !settings.openaiApiKey && <GroqOnboarding />}
        {!videoUrl ? (
          <p className="text-sm text-slate-500">Откройте страницу с видео.</p>
        ) : (
          <CreateNoteForm
            compact
            videoType={vt}
            onVideoTypeChange={setVideoType}
            language={lang}
            onLanguageChange={setLanguage}
            onCreate={create}
            canCreate
            hasNote={note !== null && note.transcript.segments.length > 0}
            task={task}
            startError={startError}
            realtime={{
              available: TAB_ID >= 0,
              state: realtime,
              onStart: () => {
                setStartError(null);
                setTab('transcript');
                sendToBackground({ type: 'realtime-start', tabId: TAB_ID, pageUrl: videoUrl.value, title: page.title, language: lang, videoType: vt }).catch((e: unknown) =>
                  setStartError(errorPayload(e)),
                );
              },
              onStop: () => void sendToBackground({ type: 'realtime-stop', tabId: TAB_ID }),
            }}
          />
        )}
      </div>
      {note ? (
        <NoteView
          note={note}
          onSeek={seek}
          tab={tab}
          onTabChange={setTab}
          summaryBusy={task?.status === 'running'}
          onGenerateSummary={(type) => {
            setStartError(null);
            startSummary({ noteId: note.id, videoType: type, language: lang }).catch((e: unknown) => setStartError(errorPayload(e)));
          }}
        />
      ) : (
        videoUrl && (
          <div className="flex-1 p-6 text-center text-sm text-slate-500">
            <p className="text-3xl">📝</p>
            <p className="mt-2">Выберите тип видео и нажмите «Создать конспект».</p>
            <p className="mt-1 text-xs text-slate-400">Скриншот кадра — Ctrl+Shift+S или 📷 сверху.</p>
          </div>
        )
      )}
    </div>
  );
}
