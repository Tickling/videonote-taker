import { describe, expect, it } from 'vitest';
import { formatTranscriptForPrompt, splitTranscript, buildSummaryPrompt } from './prompts';
import { parseSummary, SummaryParseError } from './summaryContract';
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
});

describe('shared/summarize', () => {
  const answer = JSON.stringify({ shortResume: 'ok', keyPoints: [], detailedNotes: 'n', quotes: [] });

  it('makes a single request for short transcripts', async () => {
    const calls: string[] = [];
    const result = await summarizeTranscript(
      async (p) => {
        calls.push(p.user);
        return answer;
      },
      { segments: [{ start: 0, text: 'x' }], videoType: 'educational', language: 'ru', maxCharsPerRequest: 1000 },
    );
    expect(calls).toHaveLength(1);
    expect(result.shortResume).toBe('ok');
  });

  it('uses map-reduce for long transcripts and retries broken json once', async () => {
    let n = 0;
    const segments = Array.from({ length: 10 }, (_, i) => ({ start: i * 40, text: 'слово '.repeat(20) }));
    const result = await summarizeTranscript(
      async () => {
        n += 1;
        return n === 1 ? 'not json' : answer;
      },
      { segments, videoType: 'movie', language: 'ru', maxCharsPerRequest: 300 },
    );
    expect(result.detailedNotes).toBe('n');
    // 1 retry + N частей + 1 merge
    expect(n).toBeGreaterThan(3);
  });

  it('renders markdown', () => {
    const md = summaryToMarkdown(
      { shortResume: 'S', keyPoints: [{ text: 'K', timestamp: 61 }], detailedNotes: 'D', quotes: [{ text: 'Q', timestamp: 5 }] },
      'T',
    );
    expect(md).toContain('# T');
    expect(md).toContain('- **[01:01]** K');
    expect(md).toContain('> «Q» — [00:05]');
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
