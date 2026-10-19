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

const TIMECODES = '"timecodes": [{ "text": "что происходит в этот момент (одна строка)", "timestamp": 125 }]';
const TIMECODES_RULE =
  'timecodes — оглавление видео по порядку: моменты, где начинается новая тема или происходит важное. timestamp — число секунд от начала, бери из меток [ММ:СС] транскрипта.';

interface TypeSpec {
  title: string;
  /** Полный ответ (видео целиком или короткое видео) */
  full: string[];
  /** Ответ по части длинного видео — без «глобальных» полей */
  part: string[];
  rules: string;
  /** Поля, которые собираются по всему видео на шаге объединения */
  reduce: string[];
}

const SPECS: Record<VideoTypeId, TypeSpec> = {
  educational: {
    title: 'ОБУЧАЮЩЕЕ видео',
    full: [
      '"ideas": ["главная мысль или идея урока"]',
      '"shortResume": "о чём видео: 3–5 предложений"',
      TIMECODES,
      '"furtherReading": [{ "title": "книга, статья или тема для изучения", "why": "чем поможет" }]',
      '"example": "практический пример по теме видео (Markdown, можно с кодом)"',
    ],
    part: ['"ideas": ["главная мысль этой части"]', '"shortResume": "о чём эта часть: 2–3 предложения"', TIMECODES],
    rules:
      'ideas — 5–10 главных мыслей и идей (каждая — законченное утверждение). furtherReading — 3–5 реальных источников (книги, документация, курсы) для углубления темы; не выдумывай несуществующие. example — один наглядный пример, который закрепляет материал урока.',
    reduce: ['"ideas"', '"shortResume"', '"furtherReading"', '"example"'],
  },
  interview: {
    title: 'ИНТЕРВЬЮ / беседа',
    full: [
      '"ideas": ["основная идея или позиция собеседника"]',
      '"quotes": [{ "text": "дословная яркая цитата (Имя: …, если говорящий известен)", "timestamp": 340 }]',
      '"conclusions": ["вывод, который можно сделать из разговора"]',
      TIMECODES,
      '"shortResume": "кто беседует и о чём — 2–3 предложения"',
    ],
    part: ['"ideas": ["основная идея этой части"]', '"quotes": [{ "text": "дословная цитата", "timestamp": 340 }]', TIMECODES, '"shortResume": "о чём эта часть — 2 предложения"'],
    rules: 'ideas — 5–10 основных идей и позиций. quotes — 3–8 самых ярких дословных цитат. conclusions — 3–6 выводов: что из этого следует, что важно запомнить.',
    reduce: ['"ideas"', '"conclusions"', '"shortResume"'],
  },
  entertainment: {
    title: 'РАЗВЛЕКАТЕЛЬНОЕ видео (влог, шоу, обзор, юмор)',
    full: ['"shortResume": "краткая суть видео — 2–4 предложения живым языком"', TIMECODES],
    part: ['"shortResume": "суть этой части — 1–2 предложения"', TIMECODES],
    rules: 'Только краткая суть и таймкоды, без лишнего.',
    reduce: ['"shortResume"'],
  },
  movie: {
    title: 'ФИЛЬМ / сериал / художественное видео',
    full: [
      '"ideas": ["мысль или идея фильма"]',
      '"shortResume": "о чём фильм: завязка и сюжет — 3–5 предложений"',
      '"characters": [{ "name": "имя героя", "role": "кто он и его роль в сюжете" }]',
      TIMECODES,
      '"rating": { "score": 7.5, "comment": "оценка ИИ по 10-балльной шкале и почему" }',
    ],
    part: ['"ideas": ["мысль или идея этой части"]', '"shortResume": "что происходит в этой части"', '"characters": [{ "name": "имя", "role": "роль" }]', TIMECODES],
    rules: 'ideas — 3–7 мыслей, тем и идей фильма. characters — главные и важные второстепенные герои по именам из диалогов. rating — честная оценка сюжета, диалогов и идей.',
    reduce: ['"ideas"', '"shortResume"', '"characters"', '"rating"'],
  },
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/** Сжимает сегменты в блоки ~blockSeconds с одной меткой времени — экономит токены. */
export function formatTranscriptForPrompt(segments: PromptSegment[], blockSeconds = 30): string {
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

function jsonFormat(fields: string[]): string {
  return `Верни ТОЛЬКО валидный JSON без пояснений, строго такой структуры:\n{\n  ${fields.join(',\n  ')}\n}`;
}

function baseSystem(language: string, videoType: VideoTypeId): string {
  return `Ты — эксперт по конспектам видео. Пиши на ${languageName(language)} языке, даже если транскрипт на другом. Опирайся только на транскрипт, не выдумывай события. Транскрипт может содержать ошибки автосубтитров — исправляй очевидные опечатки по смыслу. Это ${SPECS[videoType].title}.`;
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
  const spec = SPECS[input.videoType];
  const isPart = Boolean(input.part && input.part.total > 1);
  const system = `${baseSystem(input.language, input.videoType)}\n${spec.rules}\n${TIMECODES_RULE}\n\n${jsonFormat(isPart ? spec.part : spec.full)}`;

  const header: string[] = [];
  if (input.title) header.push(`Название видео: ${input.title}`);
  if (isPart && input.part) {
    header.push(`Это часть ${input.part.index + 1} из ${input.part.total} длинного видео. Опиши только эту часть.`);
  }
  if (input.screenshotTimestamps && input.screenshotTimestamps.length > 0) {
    header.push(
      `Пользователь сделал скриншоты в моменты: ${input.screenshotTimestamps.map((t) => formatTimecode(t)).join(', ')} — эти моменты для него важны.`,
    );
  }
  const user = `${header.join('\n')}${header.length ? '\n\n' : ''}Транскрипт с таймкодами:\n${input.transcript}`;
  return { system, user };
}

/** Объединение длинного видео: модели отдаём только краткое содержание частей (компактно). */
export function buildMergePrompt(partials: RawSummary[], videoType: VideoTypeId, language: string, title?: string): ChatPrompt {
  const spec = SPECS[videoType];
  const fields = spec.full.filter((f) => spec.reduce.some((key) => f.startsWith(key)));
  const system = `${baseSystem(language, videoType)} Тебе дали краткие конспекты последовательных частей одного видео. Составь итог по всему видео целиком, убери повторы.\n${spec.rules}\n\n${jsonFormat(fields)}`;
  const compact = partials.map((p, i) => {
    const lines = [`Часть ${i + 1}: ${p.shortResume}`];
    if (p.ideas.length) lines.push(`Идеи: ${p.ideas.join('; ')}`);
    if (p.characters.length) lines.push(`Герои: ${p.characters.map((c) => `${c.name} — ${c.role}`).join('; ')}`);
    return lines.join('\n');
  });
  const user = `${title ? `Название видео: ${title}\n\n` : ''}${compact.join('\n\n')}`;
  return { system, user };
}
