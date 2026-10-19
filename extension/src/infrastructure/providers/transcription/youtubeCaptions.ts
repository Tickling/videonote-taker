// Извлечение субтитров YouTube прямо из браузера (через VPN браузера, без сервера).
// Чистые функции + fetch, чтобы работать и в service worker, и в content script.

export interface RawCaption {
  start: number;
  end: number;
  text: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
}

export interface YouTubeTranscript {
  title: string;
  duration: number;
  language: string;
  segments: RawCaption[];
  method: 'transcript-panel' | 'caption-track' | 'player-capture';
}

/** У видео точно нет субтитров — сервер спрашивать бессмысленно. */
export class NoCaptionsError extends Error {
  constructor() {
    super('У этого видео нет субтитров');
    this.name = 'NoCaptionsError';
  }
}

export class CaptionsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptionsFetchError';
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Достаёт объект JSON, присвоенный переменной в HTML (`var ytInitialData = {...};`). */
export function extractJsonAssignment(html: string, name: string): unknown {
  // var ytInitialData = {...}  или  window["ytInitialData"] = {...}
  const re = new RegExp(`${name}["']?\\]?\\s*=\\s*\\{`);
  const match = re.exec(html);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Рекурсивно ищет значения по ключу (структура ответов YouTube часто меняется). */
export function findAllByKey(root: unknown, key: string, limit = 5000): unknown[] {
  const found: unknown[] = [];
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < limit * 20) {
    const node = stack.pop();
    visited += 1;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) stack.push(node[i]);
    } else if (isRecord(node)) {
      for (const [k, v] of Object.entries(node)) {
        if (k === key) {
          found.push(v);
          if (found.length >= limit) return found;
        } else stack.push(v);
      }
    }
  }
  return found;
}

function runsText(value: unknown): string {
  if (!isRecord(value)) return '';
  if (typeof value['simpleText'] === 'string') return value['simpleText'];
  const runs = value['runs'];
  if (Array.isArray(runs)) return runs.map((r) => (isRecord(r) && typeof r['text'] === 'string' ? r['text'] : '')).join('');
  return '';
}

function clean(text: string): string {
  return text
    .replace(/\[(музыка|music|аплодисменты|applause|смех|laughter)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ответ youtubei/v1/get_transcript → сегменты. */
export function parseTranscriptResponse(json: unknown): RawCaption[] {
  const segments: RawCaption[] = [];
  for (const renderer of findAllByKey(json, 'transcriptSegmentRenderer')) {
    if (!isRecord(renderer)) continue;
    const start = Number(renderer['startMs']) / 1000;
    const end = Number(renderer['endMs']) / 1000;
    const text = clean(runsText(renderer['snippet']));
    if (text && Number.isFinite(start)) segments.push({ start, end: Number.isFinite(end) ? end : start, text });
  }
  return segments.sort((a, b) => a.start - b.start);
}

/** Формат json3 (тот, что грузит сам плеер YouTube) → сегменты. */
export function parseJson3(json: unknown): RawCaption[] {
  if (!isRecord(json) || !Array.isArray(json['events'])) return [];
  const segments: RawCaption[] = [];
  for (const event of json['events']) {
    if (!isRecord(event) || !Array.isArray(event['segs'])) continue;
    const text = clean(event['segs'].map((s) => (isRecord(s) && typeof s['utf8'] === 'string' ? s['utf8'] : '')).join(''));
    if (!text) continue;
    const start = Number(event['tStartMs'] ?? 0) / 1000;
    const end = start + Number(event['dDurationMs'] ?? 0) / 1000;
    segments.push({ start, end, text });
  }
  return mergeRolling(segments);
}

/** Формат XML (srv1/timedtext по умолчанию) → сегменты. */
export function parseTimedTextXml(xml: string): RawCaption[] {
  const segments: RawCaption[] = [];
  const re = /<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  for (const m of xml.matchAll(re)) {
    const start = Number(m[1]);
    const text = clean(
      (m[3] ?? '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, ''),
    );
    if (text) segments.push({ start, end: start + Number(m[2] ?? 0), text });
  }
  return segments;
}

/** Автосубтитры в json3 повторяют куски — склеиваем подряд идущие одинаковые строки. */
function mergeRolling(segments: RawCaption[]): RawCaption[] {
  const out: RawCaption[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.text === seg.text) last.end = Math.max(last.end, seg.end);
    else out.push({ ...seg });
  }
  return out;
}

export function parseCaptionBody(body: string): RawCaption[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) {
    try {
      return parseJson3(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith('<')) return parseTimedTextXml(trimmed);
  return [];
}

/** Лучшая дорожка: ручные на нужном языке → ручные любые → авто на нужном → любые. */
export function chooseCaptionTrack(tracks: CaptionTrack[], language: string): CaptionTrack | null {
  const lang = (t: CaptionTrack): string => t.languageCode.split('-')[0]?.toLowerCase() ?? '';
  const manual = tracks.filter((t) => t.kind !== 'asr');
  const auto = tracks.filter((t) => t.kind === 'asr');
  return manual.find((t) => lang(t) === language) ?? manual[0] ?? auto.find((t) => lang(t) === language) ?? auto[0] ?? null;
}

export interface WatchPageData {
  title: string;
  duration: number;
  tracks: CaptionTrack[];
  transcriptParams: string | null;
  clientVersion: string;
  apiKey: string | null;
  hasCaptionsInfo: boolean;
}

export function parseWatchPage(html: string): WatchPageData {
  const player = extractJsonAssignment(html, 'ytInitialPlayerResponse');
  const data = extractJsonAssignment(html, 'ytInitialData');
  const tracksRaw = findAllByKey(player, 'captionTracks')[0];
  const tracks: CaptionTrack[] = Array.isArray(tracksRaw)
    ? tracksRaw.filter(isRecord).flatMap((t) =>
        typeof t['baseUrl'] === 'string' && typeof t['languageCode'] === 'string'
          ? [{ baseUrl: t['baseUrl'], languageCode: t['languageCode'], ...(typeof t['kind'] === 'string' ? { kind: t['kind'] } : {}), name: runsText(t['name']) }]
          : [],
      )
    : [];
  const details = isRecord(player) && isRecord(player['videoDetails']) ? player['videoDetails'] : {};
  const endpoint = findAllByKey(data, 'getTranscriptEndpoint')[0];
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  return {
    title: typeof details['title'] === 'string' ? details['title'] : (titleMatch?.[1] ?? '').replace(/\s*-\s*YouTube$/, ''),
    duration: Number(details['lengthSeconds'] ?? 0) || 0,
    tracks,
    transcriptParams: isRecord(endpoint) && typeof endpoint['params'] === 'string' ? endpoint['params'] : null,
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? html.match(/"clientVersion":"([^"]+)"/)?.[1] ?? '2.20250101.00.00',
    apiKey: html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? null,
    // player response есть, но блока captions нет → субтитров у видео нет
    hasCaptionsInfo: isRecord(player),
  };
}

async function viaTranscriptPanel(page: WatchPageData, language: string, fetchFn: FetchFn): Promise<RawCaption[]> {
  if (!page.transcriptParams) return [];
  const url = `https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false${page.apiKey ? `&key=${page.apiKey}` : ''}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': page.clientVersion },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: page.clientVersion, hl: language } }, params: page.transcriptParams }),
    credentials: 'include',
  });
  if (!response.ok) throw new CaptionsFetchError(`HTTP ${response.status}`);
  return parseTranscriptResponse(await response.json());
}

async function viaCaptionTrack(track: CaptionTrack, fetchFn: FetchFn): Promise<RawCaption[]> {
  const url = new URL(track.baseUrl, 'https://www.youtube.com');
  url.searchParams.set('fmt', 'json3');
  const response = await fetchFn(url.toString(), { credentials: 'include' });
  if (!response.ok) throw new CaptionsFetchError(`HTTP ${response.status}`);
  return parseCaptionBody(await response.text());
}

/**
 * Субтитры по HTML страницы видео: панель «Расшифровка» → дорожка субтитров.
 * Бросает NoCaptionsError, если у видео нет субтитров, и CaptionsFetchError при сбое.
 */
export async function transcriptFromWatchHtml(html: string, language: string, fetchFn: FetchFn): Promise<YouTubeTranscript> {
  const page = parseWatchPage(html);
  if (page.hasCaptionsInfo && page.tracks.length === 0 && !page.transcriptParams) throw new NoCaptionsError();
  const track = chooseCaptionTrack(page.tracks, language);
  const base = { title: page.title, duration: page.duration, language: track?.languageCode.split('-')[0] ?? language };
  const errors: string[] = [];
  const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^CaptionsFetchError:\s*/, '');

  if (!page.hasCaptionsInfo) errors.push('страница: нет данных плеера');
  if (page.transcriptParams) {
    try {
      const segments = await viaTranscriptPanel(page, language, fetchFn);
      if (segments.length > 0) return { ...base, segments, method: 'transcript-panel' };
      errors.push('панель «Расшифровка»: пусто');
    } catch (error) {
      errors.push(`панель «Расшифровка»: ${reason(error)}`);
    }
  } else errors.push('панель «Расшифровка»: нет');
  if (track) {
    try {
      const segments = await viaCaptionTrack(track, fetchFn);
      if (segments.length > 0) return { ...base, segments, method: 'caption-track' };
      errors.push('дорожка субтитров: пустой ответ');
    } catch (error) {
      errors.push(`дорожка субтитров: ${reason(error)}`);
    }
  } else errors.push(`дорожек субтитров: ${page.tracks.length}`);
  throw new CaptionsFetchError(errors.join('; '));
}

export async function fetchWatchHtml(videoId: string, language: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=${language}`, { credentials: 'include' });
  if (!response.ok) throw new CaptionsFetchError(`страница видео: HTTP ${response.status}`);
  return response.text();
}
