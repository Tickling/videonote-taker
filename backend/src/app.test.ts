// Сквозной тест HTTP API: настоящий Fastify + настоящий код адаптеров,
// поддельный yt-dlp и поддельный OpenAI-совместимый сервер (Groq/Whisper).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

const FAKE_YTDLP = fileURLToPath(new URL('../test/fixtures/fake-yt-dlp.mjs', import.meta.url));
const SUMMARY = {
  shortResume: 'Урок о переменных.',
  keyPoints: [{ text: 'Переменные хранят значения', timestamp: 2 }],
  detailedNotes: '## [00:02] Переменные\n- x = 1',
  quotes: [{ text: 'привет всем', timestamp: 0 }],
};

let tmp: string;
let llm: FastifyInstance;
let app: FastifyInstance;
const llmCalls: Array<{ path: string; auth: string | undefined }> = [];

async function waitForJob(jobId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i += 1) {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
    const body = res.json() as { status: string };
    if (body.status === 'completed' || body.status === 'failed') return body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('job timeout');
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'vnt-test-'));
  const audio = join(tmp, 'tone.mp3');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ac', '1', '-b:a', '32k', audio]);
  process.env['FAKE_AUDIO_FILE'] = audio;

  llm = Fastify();
  llm.addContentTypeParser(/^multipart\/form-data/, { parseAs: 'buffer' }, (_r, body, done) => done(null, body));
  llm.post('/chat/completions', async (req) => {
    llmCalls.push({ path: 'chat', auth: req.headers.authorization });
    return { id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(SUMMARY) } }] };
  });
  llm.post('/audio/transcriptions', async (req) => {
    llmCalls.push({ path: 'whisper', auth: req.headers.authorization });
    return { text: 'речь', language: 'russian', duration: 2, segments: [{ id: 0, start: 0, end: 2, text: ' Распознанная речь', avg_logprob: -0.1, no_speech_prob: 0.01 }, { id: 1, start: 2, end: 2.5, text: 'Продолжение следует...', no_speech_prob: 0.01 }] };
  });
  const llmUrl = await llm.listen({ port: 0, host: '127.0.0.1' });

  app = await buildApp(
    loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_PATH: join(tmp, 'db.sqlite'),
      TMP_DIR: join(tmp, 'work'),
      YTDLP_PATH: FAKE_YTDLP,
      GROQ_BASE_URL: llmUrl,
      OPENAI_BASE_URL: llmUrl,
    }),
  );
});

afterAll(async () => {
  await app?.close();
  await llm?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('HTTP API', () => {
  it('reports health with tool availability', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, ytDlp: true, ytDlpVersion: '2099.01.01', localWhisper: false });
  });

  it('validates the request', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/transcribe-by-url', payload: { videoUrl: 'https://example.com/v' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: expect.stringContaining('YouTube') } });
  });

  it('extracts free subtitles and generates a Groq summary (key from header)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe-by-url',
      headers: { 'x-groq-api-key': 'gsk_test' },
      payload: { videoUrl: 'https://youtu.be/lesson0001', language: 'ru', videoType: 'educational', generateSummary: true },
    });
    expect(res.statusCode).toBe(202);
    const { jobId, status, estimatedTime } = res.json() as { jobId: string; status: string; estimatedTime: number };
    expect(status).toBe('processing');
    expect(estimatedTime).toBeGreaterThan(0);

    const job = (await waitForJob(jobId)) as { status: string; progress: number; result: { title: string; transcript: { source: string; segments: Array<{ text: string }> }; summary: { markdown: string; provider: string; keyPoints: unknown[] } } };
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.result.title).toBe('Тестовое видео lesson0001');
    expect(job.result.transcript.source).toBe('subtitles');
    expect(job.result.transcript.segments.map((s) => s.text)).toEqual(['привет всем это', 'урок про переменные', 'x = 1 & y = 2']);
    expect(job.result.summary.provider).toBe('groq');
    expect(job.result.summary.markdown).toContain('## Ключевые моменты');
    expect(llmCalls.at(-1)).toEqual({ path: 'chat', auth: 'Bearer gsk_test' });
  });

  it('falls back to Whisper (with chunk filtering) when there are no subtitles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe-by-url',
      headers: { 'x-openai-api-key': 'sk-test' },
      payload: { videoUrl: 'https://www.youtube.com/watch?v=nosubs00001', transcriptionMode: 'auto' },
    });
    const job = (await waitForJob((res.json() as { jobId: string }).jobId)) as { status: string; result: { transcript: { source: string; segments: Array<{ text: string }> } } };
    expect(job.status).toBe('completed');
    expect(job.result.transcript.source).toBe('whisper');
    expect(job.result.transcript.segments.map((s) => s.text)).toEqual(['Распознанная речь']);
    expect(llmCalls.at(-1)).toEqual({ path: 'whisper', auth: 'Bearer sk-test' });
  });

  it('reports missing subtitles, private and removed videos with clear codes', async () => {
    const cases: Array<[string, string, string]> = [
      ['https://www.youtube.com/watch?v=nosubs00002', 'subtitles', 'SUBTITLES_NOT_FOUND'],
      ['https://www.youtube.com/watch?v=private0001', 'auto', 'VIDEO_PRIVATE'],
      ['https://www.youtube.com/watch?v=removed0001', 'auto', 'VIDEO_UNAVAILABLE'],
    ];
    for (const [videoUrl, transcriptionMode, code] of cases) {
      const res = await app.inject({ method: 'POST', url: '/api/transcribe-by-url', payload: { videoUrl, transcriptionMode } });
      const job = (await waitForJob((res.json() as { jobId: string }).jobId)) as { status: string; error: { code: string; message: string } };
      expect(job.status).toBe('failed');
      expect(job.error.code).toBe(code);
      expect(job.error.message.length).toBeGreaterThan(10);
    }
  });

  it('returns 404 for unknown jobs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'JOB_NOT_FOUND' } });
  });

  it('transcribes a real-time chunk with offset via Whisper', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcribe-chunk?start=60&language=ru&mode=whisper',
      headers: { 'content-type': 'audio/webm', 'x-openai-api-key': 'sk-test' },
      payload: Buffer.from('fake-webm-audio'),
    });
    expect(res.statusCode).toBe(200);
    const { segments } = res.json() as { segments: Array<{ start: number; text: string }> };
    expect(segments).toEqual([expect.objectContaining({ start: 60, text: 'Распознанная речь' })]);
  });

  it('rejects chunks without a key or local whisper', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/transcribe-chunk?mode=local_whisper', headers: { 'content-type': 'audio/webm' }, payload: Buffer.from('x') });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'LOCAL_WHISPER_NOT_CONFIGURED' } });
  });
});
