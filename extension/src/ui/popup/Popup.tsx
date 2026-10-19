import { ArrowLeft, Link2, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { VideoNote } from '@domain/entities/VideoNote';
import { VIDEO_PLATFORMS, VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { buildConfig } from '@infrastructure/config';
import { VIDEO_TYPES, type VideoType } from '@domain/valueObjects/VideoType';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { PLATFORM_LABELS, VIDEO_TYPE_LABELS } from '@infrastructure/exporters/labels';
import { sendToBackground, type RealtimeState } from '@infrastructure/messaging/messages';
import { startCreateNote, startSummary } from '../shared/actions';
import { Button, cx, GroqOnboarding, Header, Tabs } from '../shared/components';
import { CreateNoteForm } from '../shared/CreateNoteForm';
import { useContainer, useNote, useNotesList, useRealtime, useSettings, useTask } from '../shared/hooks';
import { NoteMeta, NoteView } from '../shared/NoteView';

type Screen = 'new' | 'history';

/** В сборке «только YouTube» ссылки Rutube/VK не принимаются. */
function isAllowed(url: VideoUrl): boolean {
  return !buildConfig.youtubeOnly || url.getPlatform() === VideoPlatform.YOUTUBE;
}

function errorPayload(error: unknown): { code: string; message: string } {
  const e = error as Error & { code?: string };
  return { code: e.code ?? 'UNKNOWN', message: e.message };
}

function NewNoteScreen() {
  const { settings, loaded } = useSettings();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState<string | undefined>();
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [videoType, setVideoType] = useState<VideoType | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ code: string; message: string } | null>(null);

  // Ссылка из активной вкладки, если это видео
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      const tabVideo = tab?.url ? VideoUrl.tryCreate(tab.url) : null;
      if (tab?.url && tabVideo && isAllowed(tabVideo)) {
        setUrl(tab.url);
        setTitle(tab.title?.replace(/^\(\d+\)\s*/, '').replace(/\s*[-|—]\s*(YouTube|RUTUBE|VK.*)$/i, ''));
        setActiveTabId(tab.id ?? null);
      }
    });
  }, []);

  const parsedUrl = useMemo(() => VideoUrl.tryCreate(url), [url]);
  const videoUrl = parsedUrl && isAllowed(parsedUrl) ? parsedUrl : null;
  const noteId = videoUrl?.getKey() ?? null;
  const { note } = useNote(noteId);
  const task = useTask(noteId);
  const realtimeState: RealtimeState | null = useRealtime(activeTabId);
  const isActiveTabVideo = activeTabId !== null && videoUrl !== null;

  const vt = videoType ?? note?.videoType ?? settings.defaultVideoType;
  const lang = language ?? note?.language ?? settings.defaultLanguage;

  const create = (): void => {
    if (!videoUrl) return;
    setStartError(null);
    startCreateNote({ url: videoUrl.value, language: lang, videoType: vt, ...(title ? { title } : {}) }).catch((e: unknown) => setStartError(errorPayload(e)));
  };

  if (!loaded) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-4">
        {!settings.groqApiKey && !settings.openaiApiKey && <GroqOnboarding />}
        <div>
          <label className="relative block">
            <Link2 size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setTitle(undefined);
                setActiveTabId(null);
              }}
              placeholder={buildConfig.youtubeOnly ? 'Ссылка на видео YouTube' : 'Ссылка на YouTube, Rutube или VK Видео'}
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-24 text-sm focus:border-orange-400 focus:outline-none"
            />
            {url && (
              <span
                className={cx(
                  'absolute right-2 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  videoUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                )}
              >
                {videoUrl ? `✓ ${PLATFORM_LABELS[videoUrl.getPlatform()]}` : parsedUrl ? 'пока только YouTube' : 'не поддерживается'}
              </span>
            )}
          </label>
        </div>
        <CreateNoteForm
          videoType={vt}
          onVideoTypeChange={setVideoType}
          language={lang}
          onLanguageChange={setLanguage}
          onCreate={create}
          canCreate={videoUrl !== null}
          hasNote={note !== null && note.transcript.segments.length > 0}
          task={task}
          startError={startError}
          realtime={{
            available: isActiveTabVideo,
            state: realtimeState,
            onStart: () => {
              if (activeTabId === null || !videoUrl) return;
              setStartError(null);
              sendToBackground({ type: 'realtime-start', tabId: activeTabId, pageUrl: videoUrl.value, title: title ?? '', language: lang, videoType: vt }).catch(
                (e: unknown) => setStartError(errorPayload(e)),
              );
            },
            onStop: () => {
              if (activeTabId !== null) void sendToBackground({ type: 'realtime-stop', tabId: activeTabId });
            },
          }}
        />
      </div>
      {note && (note.transcript.segments.length > 0 || note.summary || note.screenshots.length > 0) && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100">
          <div className="px-4 pt-3">
            <p className="truncate text-sm font-semibold text-slate-900" title={note.title}>
              {note.title}
            </p>
          </div>
          <NoteView
            note={note}
            summaryBusy={task?.status === 'running'}
            onGenerateSummary={(type) => {
              setStartError(null);
              setVideoType(type);
              startSummary({ noteId: note.id, videoType: type, language: lang }).catch((e: unknown) => setStartError(errorPayload(e)));
            }}
          />
        </div>
      )}
    </div>
  );
}

function HistoryScreen() {
  const { notes } = useNotesList();
  const { deleteNote } = useContainer();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<VideoPlatform | ''>('');
  const [type, setType] = useState<VideoType | ''>('');
  const [selected, setSelected] = useState<string | null>(null);
  const { note: selectedNote } = useNote(selected);
  const task = useTask(selected);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter(
      (n: VideoNote) =>
        (!platform || n.platform === platform) &&
        (!type || n.videoType === type) &&
        (!q || n.title.toLowerCase().includes(q) || (n.summary?.shortResume.toLowerCase().includes(q) ?? false)),
    );
  }, [notes, query, platform, type]);

  if (selected && selectedNote) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeft size={14} /> Назад
          </Button>
          <p className="flex-1 truncate text-sm font-semibold" title={selectedNote.title}>
            {selectedNote.title}
          </p>
        </div>
        <div className="px-4 pb-1">
          <NoteMeta note={selectedNote} />
        </div>
        <NoteView
          note={selectedNote}
          summaryBusy={task?.status === 'running'}
          onGenerateSummary={(t) => void startSummary({ noteId: selectedNote.id, videoType: t })}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию и конспекту"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:border-orange-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {!buildConfig.youtubeOnly && (
            <select value={platform} onChange={(e) => setPlatform(e.target.value as VideoPlatform | '')} className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" aria-label="Платформа">
              <option value="">Все платформы</option>
              {VIDEO_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          )}
          <select value={type} onChange={(e) => setType(e.target.value as VideoType | '')} className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" aria-label="Тип видео">
            <option value="">Все типы</option>
            {VIDEO_TYPES.map((t) => (
              <option key={t} value={t}>
                {VIDEO_TYPE_LABELS[t].emoji} {VIDEO_TYPE_LABELS[t].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {filtered.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{notes.length ? 'Ничего не найдено' : 'Здесь появятся ваши конспекты'}</li>}
        {filtered.map((n) => (
          <li key={n.id} className="group flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(n.id)}>
              <p className="truncate text-sm font-medium text-slate-900">{n.title}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <NoteMeta note={n} />
                {n.summary ? <span className="text-[11px] text-emerald-600">✓ конспект</span> : <span className="text-[11px] text-slate-400">только транскрипт</span>}
              </div>
            </button>
            <button
              type="button"
              title="Удалить"
              className="text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
              onClick={() => {
                if (confirm(`Удалить конспект «${n.title}»?`)) void deleteNote.execute(n.id);
              }}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Popup() {
  const [screen, setScreen] = useState<Screen>('new');
  return (
    <div className="flex h-[590px] w-[400px] flex-col overflow-hidden bg-white">
      <Header />
      <Tabs
        tabs={[
          { id: 'new', label: '✨ Новый конспект' },
          { id: 'history', label: '🗂 История' },
        ]}
        value={screen}
        onChange={setScreen}
      />
      {screen === 'new' ? <NewNoteScreen /> : <HistoryScreen />}
    </div>
  );
}

