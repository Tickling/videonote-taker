// Формат ответа LLM и его разбор. Общий для расширения и backend.

export type VideoTypeId = 'educational' | 'interview' | 'entertainment' | 'movie';

export interface RawTimedItem {
  text: string;
  timestamp: number;
}

export interface RawCharacter {
  name: string;
  role: string;
}

export interface RawReading {
  title: string;
  why: string;
}

export interface RawRating {
  /** 1–10 */
  score: number;
  comment: string;
}

export interface RawSummary {
  /** «О чём видео» / «Краткая суть» */
  shortResume: string;
  /** Таймкоды: ключевые моменты по ходу видео */
  keyPoints: RawTimedItem[];
  /** Старый формат (до разделения по типам видео) — показывается, если есть */
  detailedNotes: string;
  quotes: RawTimedItem[];
  /** Основные мысли и идеи */
  ideas: string[];
  /** Выводы (интервью) */
  conclusions: string[];
  /** Герои (фильм) */
  characters: RawCharacter[];
  /** Оценка ИИ (фильм) */
  rating: RawRating | null;
  /** Что почитать по теме (обучающее) */
  furtherReading: RawReading[];
  /** Практический пример от ИИ (обучающее), Markdown */
  example: string;
}

export interface PromptSegment {
  start: number;
  text: string;
}

export class SummaryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummaryParseError';
  }
}

export function emptySummary(): RawSummary {
  return { shortResume: '', keyPoints: [], detailedNotes: '', quotes: [], ideas: [], conclusions: [], characters: [], rating: null, furtherReading: [], example: '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parts = value.replace(/[[\]]/g, '').trim().split(':');
    if (parts.every((p) => /^\d+(\.\d+)?$/.test(p))) {
      return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
    }
  }
  return 0;
}

function toTimedItems(value: unknown): RawTimedItem[] {
  if (!Array.isArray(value)) return [];
  const items: RawTimedItem[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      items.push({ text: entry.trim(), timestamp: 0 });
    } else if (isRecord(entry) && str(entry['text'])) {
      items.push({ text: str(entry['text']), timestamp: toSeconds(entry['timestamp'] ?? entry['time']) });
    }
  }
  return items;
}

function toStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : isRecord(v) ? str(v['text']) : ''))
    .filter((v) => v.length > 0);
}

function toCharacters(value: unknown): RawCharacter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => (isRecord(v) && str(v['name']) ? [{ name: str(v['name']), role: str(v['role'] ?? v['description']) }] : []));
}

function toReading(value: unknown): RawReading[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) =>
    typeof v === 'string' && v.trim() ? [{ title: v.trim(), why: '' }] : isRecord(v) && str(v['title']) ? [{ title: str(v['title']), why: str(v['why'] ?? v['description']) }] : [],
  );
}

function toRating(value: unknown): RawRating | null {
  if (!isRecord(value)) return null;
  const score = Number(value['score']);
  if (!Number.isFinite(score)) return null;
  return { score: Math.min(10, Math.max(1, Math.round(score * 10) / 10)), comment: str(value['comment']) };
}

/** Извлекает JSON из ответа модели (допускает ```json-обёртку и текст вокруг). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  // Обёртка ```json ... ``` — только если ответ с неё начинается: внутри конспекта
  // тоже бывают блоки кода, их нельзя принимать за обёртку
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // пробуем следующий вариант
    }
  }
  throw new SummaryParseError(start === -1 ? 'Ответ модели не содержит JSON' : 'Ответ модели содержит некорректный JSON');
}

export function parseSummary(raw: string): RawSummary {
  const data = extractJson(raw);
  if (!isRecord(data)) throw new SummaryParseError('Ответ модели не является объектом');
  const summary: RawSummary = {
    shortResume: str(data['shortResume'] ?? data['summary']),
    detailedNotes: str(data['detailedNotes']),
    keyPoints: toTimedItems(data['timecodes'] ?? data['keyPoints']),
    quotes: toTimedItems(data['quotes']),
    ideas: toStrings(data['ideas']),
    conclusions: toStrings(data['conclusions']),
    characters: toCharacters(data['characters']),
    rating: toRating(data['rating']),
    furtherReading: toReading(data['furtherReading']),
    example: str(data['example']),
  };
  if (!summary.shortResume && !summary.detailedNotes && summary.keyPoints.length === 0 && summary.ideas.length === 0) {
    throw new SummaryParseError('В ответе модели нет конспекта');
  }
  return summary;
}
