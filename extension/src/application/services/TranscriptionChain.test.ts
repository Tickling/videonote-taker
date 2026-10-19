import { describe, expect, it } from 'vitest';
import { SubtitlesNotFoundError, TranscriptionError } from '@domain/errors';
import { TranscriptionProvider } from '@domain/valueObjects/Providers';
import { DEFAULT_SETTINGS } from '@domain/valueObjects/UserSettings';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import { InMemorySettingsRepository, StubTranscription, silentLogger, transcriptOf } from '../testing/fakes';
import { TranscriptionChain } from './TranscriptionChain';

const input = { videoUrl: new VideoUrl('https://youtu.be/dQw4w9WgXcQ'), language: 'ru' };
const notFound = async (): Promise<never> => {
  throw new SubtitlesNotFoundError();
};

function setup(settings: Partial<typeof DEFAULT_SETTINGS>, subtitles = new StubTranscription(async () => transcriptOf([0, 'subs']))) {
  const whisper = new StubTranscription(async () => ({ ...transcriptOf([0, 'whisper']), source: 'whisper' }));
  const local = new StubTranscription(async () => ({ ...transcriptOf([0, 'local']), source: 'local_whisper' }));
  const chain = new TranscriptionChain(subtitles, whisper, local, new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, ...settings }), silentLogger);
  return { chain, subtitles, whisper, local };
}

describe('TranscriptionChain', () => {
  it('uses free subtitles first', async () => {
    const { chain, whisper } = setup({ transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER, openaiApiKey: 'sk-1' });
    const result = await chain.transcribe(input);
    expect(result.source).toBe('subtitles');
    expect(result.segments[0]?.text).toBe('subs');
    expect(whisper.calls).toHaveLength(0);
  });

  it('falls back to Whisper when subtitles are missing and Whisper is enabled with a key', async () => {
    const { chain } = setup(
      { transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER, openaiApiKey: 'sk-1' },
      new StubTranscription(notFound),
    );
    expect((await chain.transcribe(input)).source).toBe('whisper');
  });

  it('treats empty subtitles as missing', async () => {
    const { chain } = setup(
      { transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER, openaiApiKey: 'sk-1' },
      new StubTranscription(async () => transcriptOf()),
    );
    expect((await chain.transcribe(input)).source).toBe('whisper');
  });

  it('falls back to local Whisper when chosen', async () => {
    const { chain } = setup({ transcriptionProvider: TranscriptionProvider.LOCAL_WHISPER }, new StubTranscription(notFound));
    expect((await chain.transcribe(input)).source).toBe('local_whisper');
  });

  it('throws a friendly SubtitlesNotFoundError when no fallback is configured', async () => {
    const { chain } = setup({}, new StubTranscription(notFound));
    await expect(chain.transcribe(input)).rejects.toThrow(SubtitlesNotFoundError);
    await expect(chain.transcribe(input)).rejects.toThrow(/настройках ⚙️/);
  });

  it('does not use Whisper without an OpenAI key', async () => {
    const { chain, whisper } = setup({ transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER }, new StubTranscription(notFound));
    await expect(chain.transcribe(input)).rejects.toThrow(SubtitlesNotFoundError);
    expect(whisper.calls).toHaveLength(0);
  });

  it('propagates non-subtitle errors (e.g. private video) without fallback', async () => {
    const { chain, whisper } = setup(
      { transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER, openaiApiKey: 'sk-1' },
      new StubTranscription(async () => {
        throw new TranscriptionError('Видео приватное', 'VIDEO_UNAVAILABLE');
      }),
    );
    await expect(chain.transcribe(input)).rejects.toThrow('Видео приватное');
    expect(whisper.calls).toHaveLength(0);
  });

  it('sends real-time audio straight to Whisper', async () => {
    const { chain, subtitles } = setup({ transcriptionProvider: TranscriptionProvider.OPENAI_WHISPER, openaiApiKey: 'sk-1' });
    const result = await chain.transcribe({ audioBlob: new Blob(['x']), language: 'ru' });
    expect(result.source).toBe('whisper');
    expect(subtitles.calls).toHaveLength(0);
  });

  it('explains that real-time needs Whisper', async () => {
    const { chain } = setup({});
    await expect(chain.transcribe({ audioBlob: new Blob(['x']), language: 'ru' })).rejects.toThrow(/реальном времени/);
  });
});
