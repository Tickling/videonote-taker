// Общий алгоритм саммаризации (map-reduce для длинных транскриптов) поверх любой
// OpenAI-совместимой функции chat completion.
import {
  buildMergePrompt,
  buildSummaryPrompt,
  formatTranscriptForPrompt,
  splitTranscript,
  type ChatPrompt,
} from './prompts.js';
import { parseSummary, type PromptSegment, type RawSummary, type VideoTypeId } from './summaryContract.js';

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

export async function summarizeTranscript(
  complete: ChatCompletionFn,
  options: SummarizeOptions,
): Promise<RawSummary> {
  const text = formatTranscriptForPrompt(options.segments);
  if (!text) throw new Error('Транскрипт пуст — нечего конспектировать');
  const parts = splitTranscript(text, options.maxCharsPerRequest);
  const total = parts.length > 1 ? parts.length + 1 : 1;

  const runOne = async (transcript: string, index: number): Promise<RawSummary> => {
    const prompt = buildSummaryPrompt({
      videoType: options.videoType,
      language: options.language,
      transcript,
      ...(options.title ? { title: options.title } : {}),
      ...(options.screenshotTimestamps ? { screenshotTimestamps: options.screenshotTimestamps } : {}),
      part: { index, total: parts.length },
    });
    return parseWithRetry(complete, prompt);
  };

  if (parts.length === 1) {
    const result = await runOne(parts[0] ?? '', 0);
    options.onProgress?.(1, 1);
    return result;
  }

  // Последовательно: бесплатные лимиты Groq считают токены в минуту
  const partials: RawSummary[] = [];
  for (const [index, part] of parts.entries()) {
    partials.push(await runOne(part, index));
    options.onProgress?.(index + 1, total);
  }
  const merged = await parseWithRetry(
    complete,
    buildMergePrompt(partials, options.videoType, options.language, options.title),
  );
  options.onProgress?.(total, total);
  return merged;
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
