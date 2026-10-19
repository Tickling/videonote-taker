import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanCaptionText, isRollingCaptions, parseSubtitles } from './subtitleParser.js';

const fixture = (name: string): string => readFileSync(new URL(`../../../test/fixtures/${name}`, import.meta.url), 'utf8');

describe('parseSubtitles', () => {
  it('deduplicates YouTube rolling auto-captions', () => {
    const vtt = fixture('youtube-auto.ru.vtt');
    expect(isRollingCaptions(vtt)).toBe(true);
    const segments = parseSubtitles(vtt);
    expect(segments.map((s) => s.text)).toEqual(['привет всем это', 'урок про переменные', 'x = 1 & y = 2']);
    expect(segments[1]?.start).toBeCloseTo(2.32);
    expect(segments[2]?.start).toBe(8);
    expect(segments.every((s, i) => i === 0 || s.start >= (segments[i - 1]?.end ?? 0))).toBe(true);
  });

  it('parses SRT with multi-line cues and hours', () => {
    const segments = parseSubtitles(fixture('manual.srt'));
    expect(segments.map((s) => s.text)).toEqual(['Первая строка вторая строка', 'Курсив текст', 'Через час']);
    expect(segments[2]?.start).toBe(3723);
  });

  it('merges identical consecutive manual cues', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nДа\n\n00:00:02.000 --> 00:00:03.000\nДа\n';
    expect(parseSubtitles(vtt)).toEqual([{ id: 's0', text: 'Да', start: 1, end: 3, confidence: 1 }]);
  });

  it('returns nothing for garbage', () => {
    expect(parseSubtitles('not subtitles')).toEqual([]);
  });

  it('cleans tags and entities', () => {
    expect(cleanCaptionText('<c.colorE5E5E5>hi</c> &gt; [Music] there')).toBe('hi > there');
  });
});
