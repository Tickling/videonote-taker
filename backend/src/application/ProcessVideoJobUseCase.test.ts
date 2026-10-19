import { describe, expect, it, vi } from 'vitest';
import type { ILogger, ISpeechToText, ISummarizer } from '../domain/ports.js';
import type { Credentials, Job, Transcript, VideoInfo } from '../domain/types.js';
import { ProcessVideoJobUseCase, type ProcessVideoDeps } from './ProcessVideoJobUseCase.js';

const logger: ILogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => logger };
const INFO: VideoInfo = { id: 'abc', title: 'Видео', duration: 60, language: 'ru', subtitles: {}, automaticCaptions: {} };
const SUBS: Transcript = { segments: [{ id: 's0', text: 'текст', start: 0, end: 5, confidence: 1 }], source: 'subtitles', totalDuration: 60 };
const NO_KEYS: Credentials = { openaiApiKey: null, groqApiKey: null, summaryProvider: 'groq' };

const job = (patch: Partial<Job> = {}): Job => ({
  id: 'job1',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefgh',
  language: 'ru',
  videoType: 'educational',
  mode: 'auto',
  generateSummary: false,
  status: 'processing',
  progress: 0,
  stage: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});

function deps(patch: { subs?: Transcript | null; local?: ISpeechToText | null; summarizer?: ISummarizer | null } = {}) {
  const whisper: ISpeechToText = { transcribe: vi.fn(async () => [{ id: 'w0', text: 'whisper', start: 1, end: 2, confidence: 1 }]) };
  const cleanup = vi.fn(async () => undefined);
  const d: ProcessVideoDeps = {
    info: { getInfo: vi.fn(async () => INFO) },
    subtitles: { extract: vi.fn(async () => (patch.subs === undefined ? SUBS : patch.subs)) },
    audio: { download: vi.fn(async () => '/tmp/audio.mp3') },
    speech: { openai: vi.fn(() => whisper), local: vi.fn(() => patch.local ?? null) },
    summarizers: { create: vi.fn(() => patch.summarizer ?? null) },
    workDirs: { create: vi.fn(async () => ({ path: '/tmp/w', cleanup })) },
    logger,
  };
  return { d, whisper, cleanup };
}

describe('ProcessVideoJobUseCase', () => {
  it('returns free subtitles and cleans up', async () => {
    const { d, cleanup } = deps();
    const report = vi.fn();
    const result = await new ProcessVideoJobUseCase(d).execute(job(), NO_KEYS, report);
    expect(result.transcript.source).toBe('subtitles');
    expect(result.title).toBe('Видео');
    expect(report).toHaveBeenLastCalledWith(100, 'Готово');
    expect(cleanup).toHaveBeenCalled();
    expect(d.audio.download).not.toHaveBeenCalled();
  });

  it('fails with SUBTITLES_NOT_FOUND in subtitles mode', async () => {
    const { d } = deps({ subs: null });
    await expect(new ProcessVideoJobUseCase(d).execute(job({ mode: 'subtitles' }), { ...NO_KEYS, openaiApiKey: 'sk' }, vi.fn())).rejects.toMatchObject({ code: 'SUBTITLES_NOT_FOUND' });
  });

  it('auto mode falls back to Whisper when a key is present', async () => {
    const { d, whisper } = deps({ subs: null });
    const result = await new ProcessVideoJobUseCase(d).execute(job(), { ...NO_KEYS, openaiApiKey: 'sk' }, vi.fn());
    expect(result.transcript.source).toBe('whisper');
    expect(d.speech.openai).toHaveBeenCalledWith('sk');
    expect(whisper.transcribe).toHaveBeenCalledWith('/tmp/audio.mp3', 'ru', expect.any(Function));
  });

  it('auto mode without keys reports missing subtitles', async () => {
    const { d, cleanup } = deps({ subs: null });
    await expect(new ProcessVideoJobUseCase(d).execute(job(), NO_KEYS, vi.fn())).rejects.toMatchObject({ code: 'SUBTITLES_NOT_FOUND' });
    expect(cleanup).toHaveBeenCalled();
  });

  it('whisper mode requires an OpenAI key; local mode requires configuration', async () => {
    const { d } = deps();
    await expect(new ProcessVideoJobUseCase(d).execute(job({ mode: 'whisper' }), NO_KEYS, vi.fn())).rejects.toMatchObject({ code: 'MISSING_API_KEY' });
    await expect(new ProcessVideoJobUseCase(d).execute(job({ mode: 'local_whisper' }), NO_KEYS, vi.fn())).rejects.toMatchObject({ code: 'LOCAL_WHISPER_NOT_CONFIGURED' });
  });

  it('uses local whisper when configured', async () => {
    const local: ISpeechToText = { transcribe: vi.fn(async () => [{ id: 'l', text: 'локально', start: 0, end: 1, confidence: 1 }]) };
    const { d } = deps({ local });
    const result = await new ProcessVideoJobUseCase(d).execute(job({ mode: 'local_whisper' }), NO_KEYS, vi.fn());
    expect(result.transcript.source).toBe('local_whisper');
  });

  it('keeps transcript when summary has no key or fails', async () => {
    const { d } = deps();
    const noKey = await new ProcessVideoJobUseCase(d).execute(job({ generateSummary: true }), NO_KEYS, vi.fn());
    expect(noKey.summaryError?.code).toBe('MISSING_API_KEY');

    const failing: ISummarizer = { summarize: vi.fn(async () => Promise.reject(new Error('boom'))) };
    const { d: d2 } = deps({ summarizer: failing });
    const failed = await new ProcessVideoJobUseCase(d2).execute(job({ generateSummary: true }), NO_KEYS, vi.fn());
    expect(failed.transcript.segments).toHaveLength(1);
    expect(failed.summaryError?.code).toBe('INTERNAL');
  });

  it('adds the summary when requested', async () => {
    const summarizer: ISummarizer = {
      summarize: vi.fn(async () => ({ markdown: '# M', shortResume: 'S', keyPoints: [], detailedNotes: 'D', quotes: [], videoType: 'educational' as const, provider: 'groq' as const })),
    };
    const { d } = deps({ summarizer });
    const result = await new ProcessVideoJobUseCase(d).execute(job({ generateSummary: true }), NO_KEYS, vi.fn());
    expect(result.summary?.markdown).toBe('# M');
  });
});
