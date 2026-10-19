import { describe, expect, it, vi } from 'vitest';
import {
  CaptionsFetchError,
  NoCaptionsError,
  chooseCaptionTrack,
  extractJsonAssignment,
  parseCaptionBody,
  parseJson3,
  parseTranscriptResponse,
  parseWatchPage,
  transcriptFromWatchHtml,
} from './youtubeCaptions';

const player = {
  videoDetails: { title: 'Урок "Python"; {скобки}', lengthSeconds: '600' },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr', languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto)' } },
        { baseUrl: '/api/timedtext?v=abc&lang=ru', languageCode: 'ru', name: { runs: [{ text: 'Русский' }] } },
      ],
    },
  },
};
const initialData = {
  engagementPanels: [{ engagementPanelSectionListRenderer: { content: { continuationItemRenderer: { continuationEndpoint: { getTranscriptEndpoint: { params: 'PARAMS123' } } } } } }],
};
const html = `<html><head><title>Урок - YouTube</title></head><body>
<script>var ytcfg={"INNERTUBE_API_KEY":"KEY1","INNERTUBE_CLIENT_VERSION":"2.20260101.01.00"};</script>
<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = 1;</script>
<script>window["ytInitialData"] = ${JSON.stringify(initialData)};</script></body></html>`;

const transcriptResponse = {
  actions: [
    {
      updateEngagementPanelAction: {
        content: {
          transcriptRenderer: {
            content: {
              transcriptSearchPanelRenderer: {
                body: {
                  transcriptSegmentListRenderer: {
                    initialSegments: [
                      { transcriptSegmentRenderer: { startMs: '0', endMs: '3200', snippet: { runs: [{ text: 'Привет, ' }, { text: 'это урок' }] } } },
                      { transcriptSectionHeaderRenderer: { snippet: { simpleText: 'Глава 1' } } },
                      { transcriptSegmentRenderer: { startMs: '3200', endMs: '6000', snippet: { runs: [{ text: '[Музыка]' }] } } },
                      { transcriptSegmentRenderer: { startMs: '6000', endMs: '9000', snippet: { simpleText: 'про переменные' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
};

const json3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'раз' }, { utf8: ' два' }] },
    { tStartMs: 2000, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
    { tStartMs: 2010, dDurationMs: 1000, segs: [{ utf8: 'раз два' }] },
    { tStartMs: 4000, dDurationMs: 1500, segs: [{ utf8: 'три' }] },
    { tStartMs: 6000 },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('youtubeCaptions parsing', () => {
  it('extracts JSON assigned in HTML even with braces and quotes inside strings', () => {
    expect(extractJsonAssignment(html, 'ytInitialPlayerResponse')).toEqual(player);
    expect(extractJsonAssignment(html, 'ytInitialData')).toEqual(initialData);
    expect(extractJsonAssignment('<html></html>', 'ytInitialData')).toBeNull();
  });

  it('parses the watch page', () => {
    const page = parseWatchPage(html);
    expect(page.title).toBe('Урок "Python"; {скобки}');
    expect(page.duration).toBe(600);
    expect(page.tracks).toHaveLength(2);
    expect(page.transcriptParams).toBe('PARAMS123');
    expect(page.clientVersion).toBe('2.20260101.01.00');
    expect(page.apiKey).toBe('KEY1');
  });

  it('parses get_transcript responses, skipping headers and noise', () => {
    expect(parseTranscriptResponse(transcriptResponse)).toEqual([
      { start: 0, end: 3.2, text: 'Привет, это урок' },
      { start: 6, end: 9, text: 'про переменные' },
    ]);
  });

  it('parses json3 and XML caption bodies', () => {
    expect(parseJson3(json3)).toEqual([
      { start: 0, end: 3.01, text: 'раз два' },
      { start: 4, end: 5.5, text: 'три' },
    ]);
    expect(parseCaptionBody('<transcript><text start="1.5" dur="2">Tom &amp; Jerry</text><text start="4" dur="1">&#39;hi&#39;</text></transcript>')).toEqual([
      { start: 1.5, end: 3.5, text: 'Tom & Jerry' },
      { start: 4, end: 5, text: "'hi'" },
    ]);
    expect(parseCaptionBody('')).toEqual([]);
  });

  it('chooses manual tracks in the requested language first', () => {
    const tracks = parseWatchPage(html).tracks;
    expect(chooseCaptionTrack(tracks, 'ru')?.languageCode).toBe('ru');
    expect(chooseCaptionTrack(tracks, 'de')?.languageCode).toBe('ru');
    expect(chooseCaptionTrack(tracks.filter((t) => t.kind === 'asr'), 'ru')?.languageCode).toBe('en');
    expect(chooseCaptionTrack([], 'ru')).toBeNull();
  });
});

describe('transcriptFromWatchHtml', () => {
  it('uses the transcript panel first', async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain('/youtubei/v1/get_transcript');
      expect(url).toContain('key=KEY1');
      expect(JSON.parse(String(init?.body))).toMatchObject({ params: 'PARAMS123', context: { client: { clientName: 'WEB', hl: 'ru' } } });
      return response(transcriptResponse);
    });
    const result = await transcriptFromWatchHtml(html, 'ru', fetchFn);
    expect(result.method).toBe('transcript-panel');
    expect(result.segments).toHaveLength(2);
    expect(result.language).toBe('ru');
  });

  it('falls back to the caption track (json3) when the panel fails', async () => {
    const fetchFn = vi.fn(async (url: string) => (url.includes('get_transcript') ? response({}, 403) : response(json3)));
    const result = await transcriptFromWatchHtml(html, 'ru', fetchFn);
    expect(result.method).toBe('caption-track');
    expect(fetchFn.mock.calls[1]?.[0]).toBe('https://www.youtube.com/api/timedtext?v=abc&lang=ru&fmt=json3');
  });

  it('reports a fetch error when every method returns nothing', async () => {
    await expect(transcriptFromWatchHtml(html, 'ru', async () => response(''))).rejects.toThrow(CaptionsFetchError);
  });

  it('reports videos without captions', async () => {
    const noCaptions = `<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { title: 'x' } })};</script>`;
    await expect(transcriptFromWatchHtml(noCaptions, 'ru', async () => response(''))).rejects.toThrow(NoCaptionsError);
  });
});
