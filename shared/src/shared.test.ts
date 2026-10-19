import { describe, expect, it } from 'vitest';
import { formatTranscriptForPrompt, splitTranscript, buildSummaryPrompt } from './prompts';
import { emptySummary, parseSummary, SummaryParseError } from './summaryContract';
import { buildSummarySections } from './summaryLayout';
import { summarizeTranscript } from './summarize';
import { summaryToMarkdown } from './summaryMarkdown';

describe('shared/prompts', () => {
  it('groups segments into ~30s blocks with timecodes', () => {
    const text = formatTranscriptForPrompt([
      { start: 0, text: 'привет' },
      { start: 10, text: 'мир' },
      { start: 31, text: 'вторая   часть' },
      { start: 65, text: ' ' },
    ]);
    expect(text).toBe('[00:00] привет мир\n[00:31] вторая часть');
  });

  it('splits long transcripts by lines', () => {
    const parts = splitTranscript('aaaa\nbbbb\ncccc', 9);
    expect(parts).toEqual(['aaaa\nbbbb', 'cccc']);
  });

  it('builds type-specific prompts in the target language', () => {
    const prompt = buildSummaryPrompt({ videoType: 'interview', language: 'en', transcript: '[00:00] hi' });
    expect(prompt.system).toContain('ИНТЕРВЬЮ');
    expect(prompt.system).toContain('conclusions');
    expect(prompt.system).toContain('английском');
    expect(prompt.user).toContain('[00:00] hi');
  });
});

describe('shared/summaryContract', () => {
  it('parses fenced json and normalizes timestamps', () => {
    const summary = parseSummary(
      'Вот:\n```json\n{"shortResume":"S","keyPoints":[{"text":"A","timestamp":"01:05"},"B"],"detailedNotes":"## N","quotes":[{"text":"Q","timestamp":30}]}\n```',
    );
    expect(summary.keyPoints).toEqual([
      { text: 'A', timestamp: 65 },
      { text: 'B', timestamp: 0 },
    ]);
    expect(summary.quotes[0]).toEqual({ text: 'Q', timestamp: 30 });
  });

  it('handles code blocks inside notes (not a fence around the JSON)', () => {
    const raw = JSON.stringify({ shortResume: 'S', keyPoints: [], detailedNotes: '## Код\n```python\nprint(1)\n```', quotes: [] });
    expect(parseSummary(raw).detailedNotes).toContain('```python');
    expect(parseSummary(`Ответ:\n${raw}\nГотово`).shortResume).toBe('S');
    expect(parseSummary('```json\n' + raw + '\n```').detailedNotes).toContain('print(1)');
  });

  it('rejects garbage', () => {
    expect(() => parseSummary('no json here')).toThrow(SummaryParseError);
    expect(() => parseSummary('{"foo":1}')).toThrow(SummaryParseError);
  });

  it('parses the new type-specific fields', () => {
    const s = parseSummary(JSON.stringify({ shortResume: 'S', timecodes: [{ text: 'a', timestamp: '1:00' }], characters: [{ name: 'Нео', role: 'избранный' }], rating: { score: '8.5', comment: 'ok' }, furtherReading: ['SICP'], ideas: ['i'], conclusions: ['c'], example: 'e' }));
    expect(s.keyPoints).toEqual([{ text: 'a', timestamp: 60 }]);
    expect(s.characters).toEqual([{ name: 'Нео', role: 'избранный' }]);
    expect(s.rating).toEqual({ score: 8.5, comment: 'ok' });
    expect(s.furtherReading).toEqual([{ title: 'SICP', why: '' }]);
  });
});

describe('shared/summarize', () => {
  const answer = JSON.stringify({ shortResume: 'ok', ideas: ['идея'], timecodes: [{ text: 't', timestamp: 5 }] });

  it('makes a single request for short transcripts', async () => {
    const calls: string[] = [];
    const result = await summarizeTranscript(
      async (p) => {
        calls.push(p.system);
        return answer;
      },
      { segments: [{ start: 0, text: 'x' }], videoType: 'educational', language: 'ru', maxCharsPerRequest: 1000 },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('furtherReading');
    expect(result.shortResume).toBe('ok');
    expect(result.keyPoints).toEqual([{ text: 't', timestamp: 5 }]);
  });

  it('long videos: parts, compact merge, local timecodes; retries broken json once', async () => {
    const prompts: Array<{ system: string; user: string }> = [];
    const segments = Array.from({ length: 10 }, (_, i) => ({ start: i * 40, text: 'слово '.repeat(20) }));
    const result = await summarizeTranscript(
      async (p) => {
        prompts.push(p);
        if (prompts.length === 1) return 'not json';
        if (p.user.includes('Часть 1:')) return JSON.stringify({ shortResume: 'итог', ideas: ['общая идея'], conclusions: ['вывод'] });
        const n = prompts.length;
        return JSON.stringify({ shortResume: `часть ${n}`, ideas: [`идея ${n}`], quotes: [{ text: `цитата ${n}`, timestamp: n * 100 }], timecodes: [{ text: `момент ${n}`, timestamp: n * 100 }] });
      },
      { segments, videoType: 'interview', language: 'ru', maxCharsPerRequest: 300 },
    );
    const merge = prompts[prompts.length - 1];
    expect(merge?.user).toContain('Часть 1:');
    expect(merge?.user).not.toContain('[00:'); // в объединение транскрипт не отправляется
    expect(result.shortResume).toBe('итог');
    expect(result.conclusions).toEqual(['вывод']);
    expect(result.keyPoints.length).toBeGreaterThan(2);
    expect(result.quotes.length).toBe(result.keyPoints.length);
  });

  it('splits a part that is too large for the provider limit', async () => {
    let calls = 0;
    const segments = Array.from({ length: 4 }, (_, i) => ({ start: i * 40, text: 'слово '.repeat(10) }));
    const result = await summarizeTranscript(
      async (p) => {
        calls += 1;
        if (p.user.length > 200 && !p.user.includes('Часть 1:')) throw Object.assign(new Error('Request too large'), { status: 413 });
        return answer;
      },
      { segments, videoType: 'entertainment', language: 'ru', maxCharsPerRequest: 10_000 },
    );
    expect(calls).toBeGreaterThan(2);
    expect(result.shortResume).toBe('ok');
  });

  it('renders markdown with a type-specific layout', () => {
    const md = summaryToMarkdown(
      { ...emptySummary(), shortResume: 'S', ideas: ['I'], keyPoints: [{ text: 'K', timestamp: 61 }], quotes: [{ text: 'Q', timestamp: 5 }], conclusions: ['C'] },
      'interview',
      'T',
    );
    expect(md).toContain('# T');
    expect(md.indexOf('## Основные идеи')).toBeLessThan(md.indexOf('## Главные цитаты'));
    expect(md.indexOf('## Выводы')).toBeLessThan(md.indexOf('## Таймкоды'));
    expect(md).toContain('- [01:01] — K');
    expect(md).toContain('> «Q» — [00:05]');
  });

  it('builds sections per video type', () => {
    const s = { ...emptySummary(), shortResume: 'S', ideas: ['I'], keyPoints: [{ text: 'K', timestamp: 1 }], characters: [{ name: 'Нео', role: 'избранный' }], rating: { score: 8, comment: 'хорошо' }, furtherReading: [{ title: 'SICP', why: 'основы' }], example: '```py\nx=1\n```' };
    expect(buildSummarySections(s, 'movie').map((x) => x.title)).toEqual(['Мысли и идеи', 'О чём фильм', 'Герои', 'Таймкоды', 'Оценка ИИ']);
    expect(buildSummarySections(s, 'educational').map((x) => x.title)).toEqual(['Главные мысли и идеи', 'О чём видео', 'Таймкоды', 'Помощь от ИИ: что почитать по теме', 'Помощь от ИИ: пример']);
    expect(buildSummarySections(s, 'entertainment').map((x) => x.title)).toEqual(['Краткая суть', 'Таймкоды']);
  });
});

import { isModelUnavailable, rankModels, reasoningParams, GROQ_MODEL_PREFERENCE } from './modelSelection';

describe('shared/modelSelection', () => {
  it('ranks available models by preference and skips non-chat ones', () => {
    const available = ['whisper-large-v3', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'zeta/new-model', 'meta-llama/llama-guard-4-12b'];
    expect(rankModels(GROQ_MODEL_PREFERENCE, available)).toEqual(['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'zeta/new-model']);
    expect(rankModels(GROQ_MODEL_PREFERENCE, null)[0]).toBe('openai/gpt-oss-120b');
  });

  it('detects retired models and reasoning params', () => {
    expect(isModelUnavailable(404, 'The model `llama-3.3-70b-versatile` does not exist')).toBe(true);
    expect(isModelUnavailable(400, 'The model x has been decommissioned')).toBe(true);
    expect(isModelUnavailable(429, 'rate limit')).toBe(false);
    expect(reasoningParams('openai/gpt-oss-120b')).toEqual({ reasoning_effort: 'low' });
    expect(reasoningParams('qwen/qwen3.6-27b')).toEqual({});
  });
});
