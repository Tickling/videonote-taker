// Общий алгоритм саммаризации поверх любой OpenAI-совместимой функции chat completion.
// Длинные видео: части конспектируются по очереди, таймкоды и цитаты склеиваются локально,
// а модель на шаге объединения получает только краткое содержание частей — так запрос
// укладывается в бесплатные лимиты Groq.
import { buildMergePrompt, buildSummaryPrompt, formatTranscriptForPrompt, splitTranscript, type ChatPrompt } from './prompts.js';
import { emptySummary, parseSummary, type PromptSegment, type RawSummary, type RawTimedItem, type VideoTypeId } from './summaryContract.js';

export type ChatCompletionFn = (prompt: ChatPrompt) => Promise<string>;

export interface SummarizeOptions {
  segments: PromptSegment[];
  videoType: VideoTypeId;
  language: string;
  title?: string;
  screenshotTimestamps?: number[];
  /** Максимум символов транскрипта на один запрос (зависит от лимитов провайдера). */
  maxCharsPerRequest: number;
  onProgress?: (done: number, total: number) => void;
}

const MAX_TIMECODES = 30;
const MAX_QUOTES = 10;

/** Запрос «слишком большой» для лимита провайдера (HTTP 413) — часть надо разделить. */
function isTooLarge(error: unknown): boolean {
  const e = error as { status?: unknown; message?: unknown } | null;
  return e?.status === 413 || (typeof e?.message === 'string' && /request too large|reduce your message size|context_length/i.test(e.message));
}

function dedupeTimed(items: RawTimedItem[], max: number): RawTimedItem[] {
  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp);
  const out: RawTimedItem[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && (Math.abs(last.timestamp - item.timestamp) < 5 || last.text === item.text)) continue;
    out.push(item);
  }
  if (out.length <= max) return out;
  // Равномерно прореживаем, сохраняя охват всего видео
  const step = out.length / max;
  return Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]).filter((x): x is RawTimedItem => Boolean(x));
}

export async function summarizeTranscript(complete: ChatCompletionFn, options: SummarizeOptions): Promise<RawSummary> {
  const text = formatTranscriptForPrompt(options.segments);
  if (!text) throw new Error('Транскрипт пуст — нечего конспектировать');
  const parts = splitTranscript(text, options.maxCharsPerRequest);
  const total = parts.length > 1 ? parts.length + 1 : 1;

  const prompt = (transcript: string, index: number, count: number): ChatPrompt =>
    buildSummaryPrompt({
      videoType: options.videoType,
      language: options.language,
      transcript,
      ...(options.title ? { title: options.title } : {}),
      ...(options.screenshotTimestamps ? { screenshotTimestamps: options.screenshotTimestamps } : {}),
      part: { index, total: count },
    });

  if (parts.length === 1) {
    try {
      const result = await parseWithRetry(complete, prompt(parts[0] ?? '', 0, 1));
      options.onProgress?.(1, 1);
      return result;
    } catch (error) {
      if (!isTooLarge(error)) throw error;
      // Не влезло в лимит — делим пополам и идём через объединение
      return summarizeTranscript(complete, { ...options, maxCharsPerRequest: Math.ceil(text.length / 2) + 1 });
    }
  }

  // Последовательно: бесплатные лимиты Groq считают токены в минуту
  const partials: RawSummary[] = [];
  for (const [index, part] of parts.entries()) {
    options.onProgress?.(index, total);
    partials.push(...(await summarizePart(complete, part, (t) => prompt(t, index, parts.length))));
  }
  options.onProgress?.(parts.length, total);

  let merged: RawSummary;
  try {
    merged = await parseWithRetry(complete, buildMergePrompt(partials, options.videoType, options.language, options.title));
  } catch (error) {
    if (isTooLarge(error)) merged = emptySummary();
    else throw error;
  }
  options.onProgress?.(total, total);

  return {
    ...merged,
    shortResume: merged.shortResume || partials.map((p) => p.shortResume).filter(Boolean).join(' '),
    ideas: merged.ideas.length ? merged.ideas : partials.flatMap((p) => p.ideas).slice(0, 10),
    characters: merged.characters.length ? merged.characters : uniqueCharacters(partials),
    keyPoints: dedupeTimed(partials.flatMap((p) => p.keyPoints), MAX_TIMECODES),
    quotes: dedupeTimed(partials.flatMap((p) => p.quotes), MAX_QUOTES),
  };
}

function uniqueCharacters(partials: RawSummary[]): RawSummary['characters'] {
  const seen = new Map<string, RawSummary['characters'][number]>();
  for (const c of partials.flatMap((p) => p.characters)) if (!seen.has(c.name.toLowerCase())) seen.set(c.name.toLowerCase(), c);
  return [...seen.values()];
}

/** Часть, не влезшая в лимит, делится ещё раз (до двух уровней). */
async function summarizePart(complete: ChatCompletionFn, text: string, prompt: (t: string) => ChatPrompt, depth = 0): Promise<RawSummary[]> {
  try {
    return [await parseWithRetry(complete, prompt(text))];
  } catch (error) {
    if (!isTooLarge(error) || depth >= 2) throw error;
    const halves = splitTranscript(text, Math.ceil(text.length / 2) + 1);
    const out: RawSummary[] = [];
    for (const half of halves) out.push(...(await summarizePart(complete, half, prompt, depth + 1)));
    return out;
  }
}

async function parseWithRetry(complete: ChatCompletionFn, prompt: ChatPrompt): Promise<RawSummary> {
  const first = await complete(prompt);
  try {
    return parseSummary(first);
  } catch {
    // Модель иногда ломает JSON — одна повторная попытка с напоминанием
    const retry = await complete({
      system: prompt.system,
      user: `${prompt.user}\n\nВАЖНО: ответ должен быть ТОЛЬКО валидным JSON указанной структуры.`,
    });
    return parseSummary(retry);
  }
}
