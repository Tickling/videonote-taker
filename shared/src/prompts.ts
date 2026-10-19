import { formatTimecode } from './timecode.js';
import type { PromptSegment, RawSummary, VideoTypeId } from './summaryContract.js';

export interface ChatPrompt {
  system: string;
  user: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'русском',
  en: 'английском',
  uk: 'украинском',
  be: 'белорусском',
  kk: 'казахском',
  de: 'немецком',
  fr: 'французском',
  es: 'испанском',
  it: 'итальянском',
  pt: 'португальском',
  pl: 'польском',
  tr: 'турецком',
  zh: 'китайском',
  ja: 'японском',
  ko: 'корейском',
};

const JSON_FORMAT = `Верни ТОЛЬКО валидный JSON без пояснений, строго такой структуры:
{
  "shortResume": "2–4 предложения: о чём видео и главный вывод",
  "keyPoints": [{ "text": "ключевой тезис", "timestamp": 125 }],
  "detailedNotes": "подробный конспект в Markdown (заголовки ##, списки, **выделения**)",
  "quotes": [{ "text": "дословная яркая цитата", "timestamp": 340 }]
}
Поле timestamp — число секунд от начала видео, бери его из меток [ММ:СС] транскрипта.
В detailedNotes ставь таймкоды в формате [ММ:СС] в начале разделов.`;

const TYPE_INSTRUCTIONS: Record<VideoTypeId, string> = {
  educational: `Это ОБУЧАЮЩЕЕ видео. Сделай учебный конспект:
- keyPoints: 5–12 главных идей и выводов, по порядку изложения;
- detailedNotes: структура по темам лекции; определения терминов (**термин** — пояснение); пошаговые инструкции нумерованными списками; примеры, формулы и код (в блоках \`\`\`) если они звучат; в конце раздел «## Вопросы для самопроверки» (3–5 вопросов);
- quotes: 0–5 важных формулировок автора.`,
  interview: `Это ИНТЕРВЬЮ / беседа. Сделай конспект разговора:
- shortResume: кто беседует (если понятно) и о чём;
- keyPoints: 5–12 главных тезисов и позиций собеседников;
- detailedNotes: раздел «## Участники», затем разделы по темам в формате «вопрос → суть ответа», отметь разногласия и неожиданные мнения, в конце «## Главные выводы»;
- quotes: 3–8 самых ярких дословных цитат (с указанием говорящего, если известно).`,
  entertainment: `Это РАЗВЛЕКАТЕЛЬНОЕ видео (влог, шоу, обзор, юмор). Сделай лёгкий конспект:
- shortResume: о чём видео в живом тоне;
- keyPoints: 4–10 самых интересных моментов;
- detailedNotes: краткий пересказ по сегментам, «## Лучшие моменты», упомянутые продукты/места/ссылки если есть;
- quotes: 2–6 смешных или запоминающихся фраз.`,
  movie: `Это ФИЛЬМ / сериал / художественное видео. Сделай конспект-разбор:
- shortResume: жанр и завязка без спойлеров;
- keyPoints: 5–10 ключевых сюжетных поворотов по порядку;
- detailedNotes: «## Персонажи» (имя — роль), «## Сюжет» по актам (первая строка раздела: «⚠️ Дальше спойлеры»), «## Темы и идеи», «## Интересные детали»;
- quotes: 3–8 запоминающихся реплик.`,
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/** Сжимает сегменты в блоки ~blockSeconds с одной меткой времени — экономит токены. */
export function formatTranscriptForPrompt(
  segments: PromptSegment[],
  blockSeconds = 30,
): string {
  const lines: string[] = [];
  let blockStart = -1;
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length > 0) lines.push(`[${formatTimecode(blockStart)}] ${buffer.join(' ')}`);
    buffer = [];
  };
  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (blockStart < 0 || segment.start - blockStart >= blockSeconds) {
      flush();
      blockStart = segment.start;
    }
    buffer.push(text);
  }
  flush();
  return lines.join('\n');
}

/** Делит подготовленный транскрипт на части не длиннее maxChars (по строкам). */
export function splitTranscript(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > maxChars) {
      parts.push(current);
      current = '';
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) parts.push(current);
  return parts;
}

export interface SummaryPromptInput {
  videoType: VideoTypeId;
  language: string;
  transcript: string;
  title?: string;
  screenshotTimestamps?: number[];
  part?: { index: number; total: number };
}

export function buildSummaryPrompt(input: SummaryPromptInput): ChatPrompt {
  const lang = languageName(input.language);
  const system = `Ты — эксперт по созданию структурированных конспектов видео. Пиши на ${lang} языке, даже если транскрипт на другом. Опирайся только на транскрипт, ничего не выдумывай. Транскрипт может содержать ошибки автосубтитров — исправляй очевидные опечатки по смыслу.\n\n${TYPE_INSTRUCTIONS[input.videoType]}\n\n${JSON_FORMAT}`;

  const header: string[] = [];
  if (input.title) header.push(`Название видео: ${input.title}`);
  if (input.part && input.part.total > 1) {
    header.push(
      `Это часть ${input.part.index + 1} из ${input.part.total} длинного транскрипта. Законспектируй только эту часть.`,
    );
  }
  if (input.screenshotTimestamps && input.screenshotTimestamps.length > 0) {
    header.push(
      `Пользователь сделал скриншоты в моменты: ${input.screenshotTimestamps
        .map((t) => formatTimecode(t))
        .join(', ')} — эти моменты для него важны, отрази их в конспекте.`,
    );
  }
  const user = `${header.join('\n')}${header.length ? '\n\n' : ''}Транскрипт с таймкодами:\n${input.transcript}`;
  return { system, user };
}

export function buildMergePrompt(
  partials: RawSummary[],
  videoType: VideoTypeId,
  language: string,
  title?: string,
): ChatPrompt {
  const lang = languageName(language);
  const system = `Ты — эксперт по конспектам. Тебе дали конспекты последовательных частей одного видео. Объедини их в один цельный конспект на ${lang} языке: убери повторы, сохрани таймкоды, выстрой единую структуру.\n\n${TYPE_INSTRUCTIONS[videoType]}\n\n${JSON_FORMAT}`;
  const user = `${title ? `Название видео: ${title}\n\n` : ''}Конспекты частей (JSON):\n${partials
    .map((p, i) => `--- Часть ${i + 1} ---\n${JSON.stringify(p)}`)
    .join('\n')}`;
  return { system, user };
}
