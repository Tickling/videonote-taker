import { AlertTriangle, BookOpen, CheckCircle2, Loader2, Settings, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { SUPPORTED_LANGUAGES } from '@domain/valueObjects/Language';
import { VIDEO_TYPES, type VideoType } from '@domain/valueObjects/VideoType';
import { VIDEO_TYPE_HINTS, VIDEO_TYPE_LABELS } from '@infrastructure/exporters/labels';
import { openGuide, openSettings } from './actions';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  className,
  title,
  type = 'button',
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
  size?: 'sm' | 'md';
}) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm hover:from-rose-600 hover:to-orange-600',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
      {children}
    </button>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return <img src={chrome.runtime.getURL('icons/icon-128.png')} width={size} height={size} alt="" className="rounded-md" />;
}

export function Header({ title = 'VideoNote Taker', onClose, extra }: { title?: string; onClose?: () => void; extra?: ReactNode }) {
  return (
    <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
      <Logo />
      <h1 className="flex-1 truncate text-base font-semibold text-slate-900">{title}</h1>
      {extra}
      <IconButton onClick={openSettings} label="Настройки">
        <Settings size={18} />
      </IconButton>
      {onClose && (
        <IconButton onClick={onClose} label="Закрыть">
          <X size={18} />
        </IconButton>
      )}
    </header>
  );
}

export function VideoTypeSelector({ value, onChange, compact }: { value: VideoType; onChange: (v: VideoType) => void; compact?: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Тип видео">
        {VIDEO_TYPES.map((type) => {
          const { emoji, label } = VIDEO_TYPE_LABELS[type];
          const active = type === value;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(type)}
              title={`${label}: ${VIDEO_TYPE_HINTS[type]}`}
              className={cx(
                'flex flex-col items-center rounded-lg border px-1 transition',
                compact ? 'py-1' : 'py-2',
                active ? 'border-orange-400 bg-orange-50 text-orange-700 ring-1 ring-orange-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <span className={compact ? 'text-base' : 'text-xl'}>{emoji}</span>
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 flex gap-1 text-[11px] leading-snug text-slate-500" aria-live="polite">
        <span aria-hidden>💡</span>
        <span>
          <b className="font-medium text-slate-600">В конспекте:</b> {VIDEO_TYPE_HINTS[value].charAt(0).toLowerCase() + VIDEO_TYPE_HINTS[value].slice(1)}
        </span>
      </p>
    </div>
  );
}

export function LanguageSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Язык конспекта"
      className={cx('rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none', className)}
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

export function ProgressBar({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={14} className="animate-spin text-orange-500" />
        <span className="flex-1 truncate">{stage}</span>
        <span className="tabular-nums text-slate-400">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-500" style={{ width: `${Math.max(3, progress)}%` }} />
      </div>
    </div>
  );
}

const ERROR_ACTIONS: Record<string, Array<{ label: string; run: () => void }>> = {
  MISSING_API_KEY: [
    { label: '⚙️ Открыть настройки', run: openSettings },
    { label: '📖 Как получить ключ Groq', run: () => openGuide('groq') },
  ],
  INVALID_API_KEY: [{ label: '⚙️ Проверить ключ', run: openSettings }],
  SUBTITLES_NOT_FOUND: [
    { label: '⚙️ Добавить ключ OpenAI', run: openSettings },
    { label: '📖 Как получить ключ', run: () => openGuide('openai') },
  ],
  BACKEND_UNAVAILABLE: [{ label: '⚙️ Адрес сервера', run: openSettings }],
};

export function ErrorBanner({ error, onRetry, tone = 'error' }: { error: { code: string; message: string }; onRetry?: () => void; tone?: 'error' | 'warning' }) {
  const actions = ERROR_ACTIONS[error.code] ?? [];
  return (
    <div className={cx('rounded-lg border p-3 text-sm', tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900')} role="alert">
      <div className="flex gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p className="flex-1">{error.message}</p>
      </div>
      {(actions.length > 0 || onRetry) && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
          {actions.map((a) => (
            <Button key={a.label} size="sm" onClick={a.run}>
              {a.label}
            </Button>
          ))}
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              🔄 Повторить
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
      <CheckCircle2 size={16} /> {children}
    </div>
  );
}

/** Подсказка при первом запуске: бесплатный ключ Groq. */
export function GroqOnboarding() {
  return (
    <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 p-3 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">👋 Один шаг до конспектов</p>
      <p className="mt-1">
        Транскрипты работают сразу. Для конспектов добавьте <b>бесплатный</b> ключ Groq — это 2 минуты, карта не нужна.
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" onClick={() => openGuide('groq')}>
          <BookOpen size={14} /> Инструкция
        </Button>
        <Button size="sm" variant="primary" onClick={openSettings}>
          <Settings size={14} /> Вставить ключ
        </Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-100 px-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
            t.id === value ? 'border-orange-500 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
