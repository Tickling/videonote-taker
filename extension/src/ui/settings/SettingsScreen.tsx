import { BookOpen, Brain, Eye, EyeOff, FileText, Globe, Loader2, Save, Server } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { SettingsFieldError } from '@application/useCases/SaveSettingsUseCase';
import type { BackendHealth } from '@domain/ports/IBackendClient';
import { SummaryProvider, TranscriptionProvider } from '@domain/valueObjects/Providers';
import type { UserSettings } from '@domain/valueObjects/UserSettings';
import { openGuide } from '../shared/actions';
import { Button, cx, LanguageSelect, Logo, VideoTypeSelector } from '../shared/components';
import { useContainer, useSettings } from '../shared/hooks';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
        {icon} {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Current({ children, free }: { children: ReactNode; free: boolean }) {
  return (
    <p className={cx('rounded-lg px-3 py-2 text-sm', free ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800')}>
      Текущий: <b>{children}</b> {free ? '✅' : '💳'}
    </p>
  );
}

function Radio({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint?: string }) {
  return (
    <label className={cx('flex cursor-pointer gap-3 rounded-lg border p-3 transition', checked ? 'border-orange-400 bg-orange-50/60' : 'border-slate-200 hover:bg-slate-50')}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 accent-orange-500" />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function KeyInput({ label, value, onChange, placeholder, error }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">🔑 {label}</span>
      <span className="relative block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cx(
            'w-full rounded-lg border py-2 pl-3 pr-10 font-mono text-sm focus:outline-none',
            error ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-orange-400',
          )}
        />
        <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-700" aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function GuideLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:underline">
      <BookOpen size={14} /> {children} <FileText size={12} /> PDF →
    </button>
  );
}

export function SettingsScreen() {
  const { settings, loaded } = useSettings();
  const { saveSettings } = useContainer();
  const [draft, setDraft] = useState<UserSettings | null>(null);
  const [errors, setErrors] = useState<SettingsFieldError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<BackendHealth | 'checking' | 'down' | null>(null);

  useEffect(() => {
    if (loaded && draft === null) setDraft(settings);
  }, [loaded, settings, draft]);

  if (!draft) return null;
  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]): void => {
    setDraft({ ...draft, [key]: value });
    setSaved(false);
  };
  const fieldError = (field: SettingsFieldError['field']): string | undefined => errors.find((e) => e.field === field)?.message;

  const save = async (): Promise<void> => {
    setSaving(true);
    setErrors([]);
    setWarnings([]);
    try {
      const result = await saveSettings.execute(draft);
      if (result.ok) {
        setDraft(result.settings);
        setWarnings(result.warnings);
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else setErrors(result.errors);
    } finally {
      setSaving(false);
    }
  };

  const checkBackend = async (): Promise<void> => {
    setHealth('checking');
    // Проверяем адрес из черновика, не сохраняя его
    const probe = await fetch(`${draft.backendUrl.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? (r.json() as Promise<BackendHealth>) : null))
      .catch(() => null);
    setHealth(probe ?? 'down');
  };

  const groqSelected = draft.summaryProvider === SummaryProvider.GROQ;
  const summaryKey = groqSelected ? draft.groqApiKey ?? '' : draft.openaiApiKey ?? '';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <header className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">⚙️ Настройки VideoNote Taker</h1>
            <p className="text-sm text-slate-500">Бесплатно по умолчанию, мощно по желанию. Ключи хранятся только в этом браузере.</p>
          </div>
        </header>

        <Section icon={<span>📝</span>} title="Транскрибация">
          <Current free={draft.transcriptionProvider !== TranscriptionProvider.OPENAI_WHISPER}>
            {draft.transcriptionProvider === TranscriptionProvider.OPENAI_WHISPER
              ? 'Автосубтитры + OpenAI Whisper (платно, если субтитров нет)'
              : draft.transcriptionProvider === TranscriptionProvider.LOCAL_WHISPER
                ? 'Автосубтитры + локальный Whisper (бесплатно)'
                : 'Автосубтитры (бесплатно)'}
          </Current>
          <div className="space-y-2">
            <Radio
              checked={draft.transcriptionProvider === TranscriptionProvider.SUBTITLES}
              onChange={() => set('transcriptionProvider', TranscriptionProvider.SUBTITLES)}
              title="Только автосубтитры (бесплатно)"
              hint="Работает для большинства видео YouTube, части Rutube и VK"
            />
            <Radio
              checked={draft.transcriptionProvider === TranscriptionProvider.OPENAI_WHISPER}
              onChange={() => set('transcriptionProvider', TranscriptionProvider.OPENAI_WHISPER)}
              title="Использовать OpenAI Whisper (если субтитры недоступны)"
              hint="≈ 35 ₽ за час видео. Нужен для записи в реальном времени"
            />
            <Radio
              checked={draft.transcriptionProvider === TranscriptionProvider.LOCAL_WHISPER}
              onChange={() => set('transcriptionProvider', TranscriptionProvider.LOCAL_WHISPER)}
              title="Локальный Whisper (для продвинутых)"
              hint="Бесплатно, распознаёт на вашем компьютере. Нужен whisper.cpp рядом с сервером"
            />
          </div>
          {draft.transcriptionProvider === TranscriptionProvider.OPENAI_WHISPER && (
            <KeyInput label="API-ключ OpenAI" value={draft.openaiApiKey ?? ''} onChange={(v) => set('openaiApiKey', v)} placeholder="sk-..." {...(fieldError('openaiApiKey') ? { error: fieldError('openaiApiKey') } : {})} />
          )}
          <div className="flex flex-col gap-1">
            <GuideLink onClick={() => openGuide('openai')}>Как получить ключ OpenAI?</GuideLink>
            <GuideLink onClick={() => openGuide('local-whisper')}>Как настроить локальный Whisper?</GuideLink>
          </div>
        </Section>

        <Section icon={<Brain size={18} className="text-orange-500" />} title="Саммаризация">
          <Current free={groqSelected}>{groqSelected ? 'Groq (бесплатно)' : 'OpenAI GPT-4o (платно)'}</Current>
          <div className="space-y-2">
            <Radio checked={groqSelected} onChange={() => set('summaryProvider', SummaryProvider.GROQ)} title="Groq (бесплатно)" hint="Модель выбирается автоматически (GPT-OSS 120B и др.) · бесплатный лимит" />
            <Radio checked={!groqSelected} onChange={() => set('summaryProvider', SummaryProvider.OPENAI_GPT4O)} title="OpenAI GPT-4o (платно)" hint="Качественнее на сложных темах · ≈ 10 ₽ за час видео" />
          </div>
          <KeyInput
            label={groqSelected ? 'API-ключ Groq' : 'API-ключ OpenAI'}
            value={summaryKey}
            onChange={(v) => set(groqSelected ? 'groqApiKey' : 'openaiApiKey', v)}
            placeholder={groqSelected ? 'gsk_...' : 'sk-...'}
            {...(fieldError(groqSelected ? 'groqApiKey' : 'openaiApiKey') ? { error: fieldError(groqSelected ? 'groqApiKey' : 'openaiApiKey') } : {})}
          />
          {!groqSelected && <p className="text-xs text-slate-500">Если ключ OpenAI не подойдёт, конспект будет создан через Groq (если его ключ указан).</p>}
          <div className="flex flex-col gap-1">
            <GuideLink onClick={() => openGuide('groq')}>Как получить ключ Groq?</GuideLink>
            <GuideLink onClick={() => openGuide('openai')}>Как получить ключ OpenAI?</GuideLink>
          </div>
        </Section>

        <Section icon={<Globe size={18} className="text-orange-500" />} title="Общие">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Язык конспекта по умолчанию</span>
            <LanguageSelect value={draft.defaultLanguage} onChange={(v) => set('defaultLanguage', v)} className="w-full" />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Тип видео по умолчанию</span>
            <VideoTypeSelector value={draft.defaultVideoType} onChange={(v) => set('defaultVideoType', v)} />
          </div>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Server size={14} /> Адрес сервера VideoNote
            </span>
            <span className="flex gap-2">
              <input
                value={draft.backendUrl}
                onChange={(e) => set('backendUrl', e.target.value)}
                className={cx('flex-1 rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none', fieldError('backendUrl') ? 'border-red-300' : 'border-slate-200 focus:border-orange-400')}
              />
              <Button onClick={() => void checkBackend()}>{health === 'checking' ? <Loader2 size={14} className="animate-spin" /> : 'Проверить'}</Button>
            </span>
            {fieldError('backendUrl') && <span className="mt-1 block text-xs text-red-600">{fieldError('backendUrl')}</span>}
            {health === 'down' && <span className="mt-1 block text-xs text-red-600">❌ Сервер не отвечает. Запустите start-backend из папки программы.</span>}
            {health && typeof health === 'object' && (
              <span className="mt-1 block text-xs text-emerald-700">
                ✅ Сервер работает · yt-dlp {health.ytDlp ? '✅' : '❌ не найден'} · ffmpeg {health.ffmpeg ? '✅' : '⚠️ нет (нужен для Whisper)'}
                {health.localWhisper ? ' · локальный Whisper ✅' : ''}
              </span>
            )}
          </label>
        </Section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 p-4">
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? 'Проверяем ключи…' : 'Сохранить'}
          </Button>
          <Button
            onClick={() => {
              setDraft(settings);
              setErrors([]);
              setWarnings([]);
            }}
          >
            Отмена
          </Button>
          <div className="flex-1 text-sm">
            {saved && <span className="font-medium text-emerald-700">Настройки сохранены ✅</span>}
            {errors.length > 0 && <span className="text-red-600">Исправьте ошибки выше</span>}
            {warnings.map((w) => (
              <span key={w} className="block text-amber-700">
                ⚠️ {w}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
