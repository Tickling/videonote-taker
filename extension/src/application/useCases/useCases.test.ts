import { describe, expect, it, vi } from 'vitest';
import { NoteNotFoundError, SummarizationError } from '@domain/errors';
import type { ISummaryService } from '@domain/ports/ISummaryService';
import type { IScreenshotService } from '@domain/ports/IScreenshotService';
import type { IApiKeyValidator } from '@domain/ports/IApiKeyValidator';
import { SummaryProvider, TranscriptionProvider } from '@domain/valueObjects/Providers';
import { Timestamp } from '@domain/valueObjects/Timestamp';
import { DEFAULT_SETTINGS } from '@domain/valueObjects/UserSettings';
import { VideoPlatform } from '@domain/valueObjects/VideoPlatform';
import { VideoType } from '@domain/valueObjects/VideoType';
import { SummaryServiceFactory } from '../services/SummaryServiceFactory';
import { InMemoryNoteRepository, InMemorySettingsRepository, StubTranscription, silentLogger, transcriptOf } from '../testing/fakes';
import { CaptureScreenshotUseCase } from './CaptureScreenshotUseCase';
import { ExportToMarkdownUseCase, safeFilename } from './ExportUseCases';
import { GenerateSummaryUseCase } from './GenerateSummaryUseCase';
import { DeleteNoteUseCase, ListNotesUseCase, SaveNoteUseCase } from './NoteUseCases';
import { RealtimeTranscriptionUseCase } from './RealtimeTranscriptionUseCase';
import { SaveSettingsUseCase } from './SaveSettingsUseCase';
import { TranscribeVideoUseCase } from './TranscribeVideoUseCase';

const URL_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const URL_B = 'https://rutube.ru/video/c6cc4d620b1d4338901770a44b3e82f4/';

async function transcribed(notes = new InMemoryNoteRepository(), url = URL_A, title = 'Лекция') {
  const transcription = new StubTranscription(async () => ({ ...transcriptOf([0, 'привет'], [10, 'мир']), title }));
  const note = await new TranscribeVideoUseCase(transcription, notes, silentLogger).execute({
    url,
    language: 'ru',
    videoType: VideoType.EDUCATIONAL,
  });
  return { note, notes, transcription };
}

describe('TranscribeVideoUseCase', () => {
  it('creates a note keyed by video with transcript and title', async () => {
    const progress = vi.fn();
    const notes = new InMemoryNoteRepository();
    const transcription = new StubTranscription(async () => ({ ...transcriptOf([0, 'a']), title: 'Видео' }));
    const note = await new TranscribeVideoUseCase(transcription, notes, silentLogger).execute({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      language: 'ru',
      videoType: VideoType.INTERVIEW,
      onProgress: progress,
    });
    expect(note.id).toBe('youtube_dQw4w9WgXcQ');
    expect(note.title).toBe('Видео');
    expect(note.platform).toBe(VideoPlatform.YOUTUBE);
    expect(note.transcript.segments).toHaveLength(1);
    expect(progress).toHaveBeenCalled();
    expect(await notes.findById(note.id)).toEqual(note);
  });

  it('updates an existing note and keeps screenshots', async () => {
    const { notes, note } = await transcribed();
    await notes.save({ ...note, screenshots: [{ id: 'x', imageData: 'd', timestamp: Timestamp.zero(), comment: null, linkedSegmentId: null }] });
    const { note: again } = await transcribed(notes);
    expect(again.screenshots).toHaveLength(1);
    expect(again.createdAt).toEqual(note.createdAt);
  });

  it('rejects unsupported urls', async () => {
    const uc = new TranscribeVideoUseCase(new StubTranscription(async () => transcriptOf()), new InMemoryNoteRepository(), silentLogger);
    await expect(uc.execute({ url: 'https://example.com', language: 'ru', videoType: VideoType.MOVIE })).rejects.toThrow(/не поддерживается/);
  });
});

describe('GenerateSummaryUseCase', () => {
  const summaryService = (impl?: () => Promise<never>): ISummaryService & { generate: ReturnType<typeof vi.fn> } => ({
    generate: vi.fn(
      impl ??
        (async () => ({
          shortResume: 'Кратко',
          keyPoints: [{ text: 'k', timestamp: new Timestamp(10) }],
          detailedNotes: '## Заметки',
          quotes: [],
          videoType: VideoType.EDUCATIONAL,
          provider: SummaryProvider.GROQ,
        })),
    ),
  });

  it('generates and stores a summary with the chosen provider and type', async () => {
    const { notes, note } = await transcribed();
    const groq = summaryService();
    const factory = new SummaryServiceFactory(groq, summaryService(), new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk' }));
    const updated = await new GenerateSummaryUseCase(factory, notes, silentLogger).execute({ noteId: note.id, videoType: VideoType.MOVIE });
    expect(updated.summary?.shortResume).toBe('Кратко');
    expect(updated.summary?.videoType).toBe(VideoType.MOVIE);
    expect(updated.videoType).toBe(VideoType.MOVIE);
    expect(groq.generate).toHaveBeenCalledWith(note.transcript, VideoType.MOVIE, [], expect.objectContaining({ language: 'ru', title: 'Лекция' }));
  });

  it('fails for missing notes and empty transcripts', async () => {
    const notes = new InMemoryNoteRepository();
    const factory = new SummaryServiceFactory(summaryService(), summaryService(), new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk' }));
    const uc = new GenerateSummaryUseCase(factory, notes, silentLogger);
    await expect(uc.execute({ noteId: 'nope' })).rejects.toThrow(NoteNotFoundError);
    const { note } = await transcribed(notes);
    await notes.save({ ...note, transcript: { ...note.transcript, segments: [] } });
    await expect(uc.execute({ noteId: note.id })).rejects.toThrow(SummarizationError);
  });

  it('wraps provider errors into SummarizationError', async () => {
    const { notes, note } = await transcribed();
    const broken = summaryService(async () => {
      throw new Error('boom');
    });
    const factory = new SummaryServiceFactory(broken, broken, new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk' }));
    await expect(new GenerateSummaryUseCase(factory, notes, silentLogger).execute({ noteId: note.id })).rejects.toThrow(/boom/);
  });
});

describe('CaptureScreenshotUseCase', () => {
  const image = { imageData: 'data:image/jpeg;base64,AAA', width: 640, height: 360 };
  const video = { currentTime: 12.4 } as HTMLVideoElement;

  it('captures a frame, links it to the segment and creates the note if needed', async () => {
    const { notes } = await transcribed();
    const service: IScreenshotService = { captureFromVideo: vi.fn(async () => image), captureVisibleTab: vi.fn(async () => image) };
    const { note, screenshot } = await new CaptureScreenshotUseCase(service, notes, silentLogger, () => 'id1').execute({
      pageUrl: URL_A,
      title: 't',
      video,
      defaultVideoType: VideoType.EDUCATIONAL,
      defaultLanguage: 'ru',
    });
    expect(screenshot.timestamp.format()).toBe('00:12');
    expect(screenshot.linkedSegmentId).toBe('s1');
    expect(note.screenshots).toHaveLength(1);
    expect(service.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('falls back to tab capture when the frame is protected', async () => {
    const notes = new InMemoryNoteRepository();
    const service: IScreenshotService = {
      captureFromVideo: vi.fn(async () => {
        throw new Error('SecurityError');
      }),
      captureVisibleTab: vi.fn(async () => image),
    };
    const { note } = await new CaptureScreenshotUseCase(service, notes, silentLogger).execute({
      pageUrl: URL_B,
      title: 'Rutube',
      video,
      defaultVideoType: VideoType.MOVIE,
      defaultLanguage: 'ru',
    });
    expect(service.captureVisibleTab).toHaveBeenCalled();
    expect(note.title).toBe('Rutube');
    expect(note.videoType).toBe(VideoType.MOVIE);
  });
});

describe('Note use cases', () => {
  it('lists with filters, newest first, and deletes', async () => {
    const notes = new InMemoryNoteRepository();
    await transcribed(notes, URL_A, 'Python для начинающих');
    await new Promise((r) => setTimeout(r, 2));
    await transcribed(notes, URL_B, 'Фильм');
    const list = new ListNotesUseCase(notes);
    expect((await list.execute()).map((n) => n.title)).toEqual(['Фильм', 'Python для начинающих']);
    expect(await list.execute({ query: 'python' })).toHaveLength(1);
    expect(await list.execute({ platform: VideoPlatform.RUTUBE })).toHaveLength(1);
    expect(await list.execute({ videoType: VideoType.MOVIE })).toHaveLength(0);
    await new DeleteNoteUseCase(notes).execute('youtube_dQw4w9WgXcQ');
    expect(await list.execute()).toHaveLength(1);
  });

  it('edits screenshot comments and deletes screenshots', async () => {
    const { notes, note } = await transcribed();
    await notes.save({ ...note, screenshots: [{ id: 'x', imageData: 'd', timestamp: Timestamp.zero(), comment: null, linkedSegmentId: null }] });
    const uc = new SaveNoteUseCase(notes);
    expect((await uc.updateScreenshotComment(note.id, 'x', ' важно ')).screenshots[0]?.comment).toBe('важно');
    expect((await uc.deleteScreenshot(note.id, 'x')).screenshots).toHaveLength(0);
  });
});

describe('Export', () => {
  it('produces safe filenames', () => {
    expect(safeFilename('Лекция: 1/2 "Основы"?', 'docx')).toBe('Лекция 1 2 Основы .docx'.replace(' .', '.'));
    expect(safeFilename('   ', 'md')).toBe('konspekt.md');
  });

  it('exports markdown through the exporter port', async () => {
    const { notes, note } = await transcribed();
    const file = await new ExportToMarkdownUseCase({ exportToMarkdown: (n) => `# ${n.title}` }, notes).execute(note.id);
    expect(file.filename).toBe('Лекция.md');
    expect(await file.blob.text()).toBe('# Лекция');
  });
});

describe('RealtimeTranscriptionUseCase', () => {
  it('appends offset segments and skips duplicates', async () => {
    const notes = new InMemoryNoteRepository();
    const transcription = new StubTranscription(async (input) => ({
      ...transcriptOf([input.offsetSeconds ?? 0, 'фраза']),
      source: 'whisper',
    }));
    const uc = new RealtimeTranscriptionUseCase(transcription, notes, silentLogger);
    const cmd = { pageUrl: URL_A, title: 'Live', audioBlob: new Blob(['a']), videoTime: 30, language: 'ru', videoType: VideoType.EDUCATIONAL };
    await uc.appendChunk(cmd);
    await uc.appendChunk(cmd);
    const note = await uc.appendChunk({ ...cmd, videoTime: 45 });
    expect(note.transcript.segments.map((s) => s.start.seconds)).toEqual([30, 45]);
    expect(note.transcript.source).toBe('whisper');
  });
});

describe('SaveSettingsUseCase', () => {
  const validator = (valid: boolean): IApiKeyValidator => ({
    validate: vi.fn(async () => (valid ? { valid: true as const } : { valid: false as const, reason: 'invalid' as const, message: 'Ключ не подошёл' })),
  });

  it('validates changed keys and saves normalized settings', async () => {
    const repo = new InMemorySettingsRepository();
    const v = validator(true);
    const result = await new SaveSettingsUseCase(repo, v).execute({ ...DEFAULT_SETTINGS, groqApiKey: '  gsk_new ', backendUrl: 'http://localhost:3000/' });
    expect(result.ok).toBe(true);
    expect(repo.value.groqApiKey).toBe('gsk_new');
    expect(repo.value.backendUrl).toBe('http://localhost:3000');
    expect(v.validate).toHaveBeenCalledWith('groq', 'gsk_new');
  });

  it('rejects invalid keys and missing OpenAI key for paid features', async () => {
    const repo = new InMemorySettingsRepository();
    const bad = await new SaveSettingsUseCase(repo, validator(false)).execute({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk_bad' });
    expect(bad).toEqual({ ok: false, errors: [{ field: 'groqApiKey', message: 'Ключ не подошёл' }] });
    const missing = await new SaveSettingsUseCase(repo, validator(true)).execute({
      ...DEFAULT_SETTINGS,
      transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER,
    });
    expect(missing.ok).toBe(false);
    expect(repo.value.groqApiKey).toBeNull();
  });

  it('does not re-validate unchanged keys', async () => {
    const repo = new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk_same' });
    const v = validator(false);
    expect((await new SaveSettingsUseCase(repo, v).execute({ ...DEFAULT_SETTINGS, groqApiKey: 'gsk_same' })).ok).toBe(true);
    expect(v.validate).not.toHaveBeenCalled();
  });
});
