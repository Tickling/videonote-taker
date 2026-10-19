// Формат ответа LLM и его разбор. Общий для расширения и backend.

export type VideoTypeId = 'educational' | 'interview' | 'entertainment' | 'movie';

export interface RawTimedItem {
  text: string;
  timestamp: number;
}

export interface RawSummary {
  shortResume: string;
  keyPoints: RawTimedItem[];
  detailedNotes: string;
  quotes: RawTimedItem[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    } else if (isRecord(entry) && typeof entry['text'] === 'string' && entry['text'].trim()) {
      items.push({ text: entry['text'].trim(), timestamp: toSeconds(entry['timestamp']) });
    }
  }
  return items;
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
  const shortResume = typeof data['shortResume'] === 'string' ? data['shortResume'].trim() : '';
  const detailedNotes =
    typeof data['detailedNotes'] === 'string' ? data['detailedNotes'].trim() : '';
  if (!shortResume && !detailedNotes) {
    throw new SummaryParseError('В ответе модели нет ни резюме, ни конспекта');
  }
  return {
    shortResume,
    detailedNotes,
    keyPoints: toTimedItems(data['keyPoints']),
    quotes: toTimedItems(data['quotes']),
  };
}
