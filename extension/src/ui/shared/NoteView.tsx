import { Copy, FileDown, FileText, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { VideoNote } from '@domain/entities/VideoNote';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import type { VideoType } from '@domain/valueObjects/VideoType';
import { PLATFORM_LABELS, SUMMARY_PROVIDER_LABELS, TRANSCRIPT_SOURCE_LABELS, VIDEO_TYPE_LABELS } from '@infrastructure/exporters/labels';
import { downloadBlob } from './actions';
import { Button, cx, Tabs } from './components';
import { useContainer } from './hooks';

export type NoteTab = 'summary' | 'transcript' | 'screenshots';

interface NoteViewProps {
  note: VideoNote;
  /** Sidebar: перемотать видео на странице. Иначе таймкод открывает видео в новой вкладке. */
  onSeek?: (seconds: number) => void;
  onGenerateSummary?: (videoType: VideoType) => void;
  summaryBusy?: boolean;
  tab?: NoteTab;
  onTabChange?: (tab: NoteTab) => void;
  /** Блок над вкладкой «Конспект» (прогресс, ошибки) */
  summaryHeader?: ReactNode;
}

function TimeLink({ seconds, note, onSeek }: { seconds: number; note: VideoNote; onSeek?: (s: number) => void }) {
  const t = Timestamp.of(seconds);
  return (
    <a
      href={note.videoUrl.getTimestampUrl(t)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        if (onSeek) {
          e.preventDefault();
          onSeek(t.seconds);
        }
      }}
      className="shrink-0 rounded bg-orange-50 px-1 font-mono text-xs font-semibold text-orange-700 hover:bg-orange-100"
    >
      {t.format()}
    </a>
  );
}

/** [ММ:СС] в Markdown → кликабельные ссылки. */
function linkify(markdown: string): string {
  return markdown.replace(/\[(\d{1,2}(?::\d{2}){1,2})\](?!\()/g, (_m, code: string) => `[${code}](#t=${code})`);
}

function SummaryPanel({ note, onSeek, onGenerateSummary, summaryBusy, header }: Pick<NoteViewProps, 'note' | 'onSeek' | 'onGenerateSummary' | 'summaryBusy'> & { header?: ReactNode }) {
  const [regenType, setRegenType] = useState<VideoType>(note.videoType);
  const s = note.summary;
  const markdownLink = ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (href?.startsWith('#t=')) {
      try {
        return <TimeLink seconds={Timestamp.parse(href.slice(3)).seconds} note={note} {...(onSeek ? { onSeek } : {})} />;
      } catch {
        return <>{children}</>;
      }
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-orange-700 underline">
        {children}
      </a>
    );
  };

  return (
    <div className="space-y-4 p-4">
      {header}
      {!s && !summaryBusy && (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          {note.transcript.segments.length > 0 ? 'Транскрипт готов, конспекта пока нет.' : 'Конспекта пока нет.'}
          {onGenerateSummary && note.transcript.segments.length > 0 && (
            <div className="mt-2">
              <Button variant="primary" onClick={() => onGenerateSummary(note.videoType)}>
                ✨ Создать конспект
              </Button>
            </div>
          )}
        </div>
      )}
      {s && (
        <>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Кратко</h3>
            <p className="text-sm leading-relaxed text-slate-800">{s.shortResume}</p>
          </section>
          {s.keyPoints.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Ключевые моменты</h3>
              <ul className="space-y-1.5">
                {s.keyPoints.map((k, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-800">
                    <TimeLink seconds={k.timestamp.seconds} note={note} {...(onSeek ? { onSeek } : {})} />
                    <span>{k.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {s.detailedNotes && (
            <section className="prose-note text-sm text-slate-800">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Подробный конспект</h3>
              <ReactMarkdown components={{ a: markdownLink }}>{linkify(s.detailedNotes)}</ReactMarkdown>
            </section>
          )}
          {s.quotes.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Цитаты</h3>
              <div className="space-y-2">
                {s.quotes.map((q, i) => (
                  <blockquote key={i} className="flex gap-2 border-l-4 border-orange-300 pl-3 text-sm italic text-slate-700">
                    <span className="flex-1">«{q.text}»</span>
                    <TimeLink seconds={q.timestamp.seconds} note={note} {...(onSeek ? { onSeek } : {})} />
                  </blockquote>
                ))}
              </div>
            </section>
          )}
          <p className="text-[11px] text-slate-400">
            Конспект: {SUMMARY_PROVIDER_LABELS[s.provider]} · {VIDEO_TYPE_LABELS[s.videoType].label}
          </p>
          {onGenerateSummary && (
            <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3">
              <select
                value={regenType}
                onChange={(e) => setRegenType(e.target.value as VideoType)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                aria-label="Тип видео для пересоздания"
              >
                {Object.entries(VIDEO_TYPE_LABELS).map(([id, { emoji, label }]) => (
                  <option key={id} value={id}>
                    {emoji} {label}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={summaryBusy} onClick={() => onGenerateSummary(regenType)}>
                <RefreshCw size={12} /> Пересоздать
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TranscriptPanel({ note, onSeek }: Pick<NoteViewProps, 'note' | 'onSeek'>) {
  const [query, setQuery] = useState('');
  const segments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? note.transcript.segments.filter((s) => s.text.toLowerCase().includes(q)) : note.transcript.segments;
  }, [note.transcript.segments, query]);

  if (note.transcript.segments.length === 0) {
    return <p className="p-4 text-center text-sm text-slate-500">Транскрипта пока нет.</p>;
  }
  return (
    <div className="p-4">
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по транскрипту"
          className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:border-orange-400 focus:outline-none"
        />
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        Источник: {TRANSCRIPT_SOURCE_LABELS[note.transcript.source]} · {note.transcript.segments.length} фраз
      </p>
      <ul className="space-y-1">
        {segments.map((s) => (
          <li key={s.id} className="flex gap-2 text-sm leading-relaxed text-slate-800">
            <TimeLink seconds={s.start.seconds} note={note} {...(onSeek ? { onSeek } : {})} />
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScreenshotsPanel({ note, onSeek }: Pick<NoteViewProps, 'note' | 'onSeek'>) {
  const { saveNote } = useContainer();
  if (note.screenshots.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-slate-500">
        Скриншотов нет. Нажмите <kbd className="rounded border bg-slate-50 px-1">Ctrl</kbd>+<kbd className="rounded border bg-slate-50 px-1">Shift</kbd>+
        <kbd className="rounded border bg-slate-50 px-1">S</kbd> во время просмотра видео.
      </p>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {note.screenshots.map((shot) => (
        <figure key={shot.id} className="overflow-hidden rounded-lg border border-slate-200">
          <img src={shot.imageData} alt={`Скриншот ${shot.timestamp.format()}`} className="w-full" />
          <figcaption className="flex items-center gap-2 p-2">
            <TimeLink seconds={shot.timestamp.seconds} note={note} {...(onSeek ? { onSeek } : {})} />
            <input
              defaultValue={shot.comment ?? ''}
              placeholder="Комментарий…"
              onBlur={(e) => {
                if (e.target.value !== (shot.comment ?? '')) void saveNote.updateScreenshotComment(note.id, shot.id, e.target.value);
              }}
              className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-sm hover:border-slate-200 focus:border-orange-400 focus:outline-none"
            />
            <button type="button" title="Удалить скриншот" onClick={() => void saveNote.deleteScreenshot(note.id, shot.id)} className="text-slate-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExportBar({ note }: { note: VideoNote }) {
  const { exportWord, exportMarkdown } = useContainer();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = async (kind: 'md' | 'docx'): Promise<void> => {
    setBusy(kind);
    try {
      const file = kind === 'md' ? await exportMarkdown.execute(note.id) : await exportWord.execute(note.id);
      await downloadBlob(file.blob, file.filename);
    } finally {
      setBusy(null);
    }
  };
  const copy = async (): Promise<void> => {
    const file = await exportMarkdown.execute(note.id);
    // Без картинок base64 — для вставки в заметки
    await navigator.clipboard.writeText((await file.blob.text()).replace(/!\[[^\]]*\]\(data:[^)]+\)\n?/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex gap-1.5 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
      <Button size="sm" onClick={() => void run('docx')} disabled={busy !== null}>
        <FileDown size={14} /> Word
      </Button>
      <Button size="sm" onClick={() => void run('md')} disabled={busy !== null}>
        <FileText size={14} /> Markdown
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void copy()}>
        <Copy size={14} /> {copied ? 'Скопировано ✓' : 'Копировать'}
      </Button>
    </div>
  );
}

export function NoteMeta({ note }: { note: VideoNote }) {
  const type = VIDEO_TYPE_LABELS[note.videoType];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      <span className="rounded-full bg-slate-100 px-2 py-0.5">{PLATFORM_LABELS[note.platform]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5">
        {type.emoji} {type.label}
      </span>
      <span>{note.updatedAt.toLocaleDateString('ru-RU')}</span>
    </div>
  );
}

export function NoteView(props: NoteViewProps) {
  const [localTab, setLocalTab] = useState<NoteTab>(props.note.summary || !props.note.transcript.segments.length ? 'summary' : 'transcript');
  const tab = props.tab ?? localTab;
  const setTab = props.onTabChange ?? setLocalTab;
  const { note } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        tabs={[
          { id: 'summary', label: 'Конспект' },
          { id: 'transcript', label: 'Транскрипт', count: note.transcript.segments.length },
          { id: 'screenshots', label: 'Скриншоты', count: note.screenshots.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className={cx('min-h-0 flex-1 overflow-y-auto')}>
        {tab === 'summary' && (
          <SummaryPanel
            note={note}
            header={props.summaryHeader}
            {...(props.onSeek ? { onSeek: props.onSeek } : {})}
            {...(props.onGenerateSummary ? { onGenerateSummary: props.onGenerateSummary } : {})}
            {...(props.summaryBusy !== undefined ? { summaryBusy: props.summaryBusy } : {})}
          />
        )}
        {tab === 'transcript' && <TranscriptPanel note={note} {...(props.onSeek ? { onSeek: props.onSeek } : {})} />}
        {tab === 'screenshots' && <ScreenshotsPanel note={note} {...(props.onSeek ? { onSeek: props.onSeek } : {})} />}
      </div>
      <ExportBar note={note} />
    </div>
  );
}
