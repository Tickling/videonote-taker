import { describe, expect, it } from 'vitest';
import type { VideoInfo } from '../../domain/types.js';
import { chooseSubtitleTracks } from './YtDlpAdapter.js';

const info = (patch: Partial<VideoInfo>): VideoInfo => ({ id: 'x', title: 't', duration: 1, language: null, subtitles: {}, automaticCaptions: {}, ...patch });

describe('chooseSubtitleTracks', () => {
  it('prefers manual subtitles in the requested language', () => {
    const tracks = chooseSubtitleTracks(info({ subtitles: { en: [], ru: [] }, automaticCaptions: { 'en-orig': [] } }), 'ru');
    expect(tracks[0]).toEqual({ key: 'ru', auto: false });
  });

  it('prefers original-language auto captions over machine translation', () => {
    const tracks = chooseSubtitleTracks(info({ language: 'en', automaticCaptions: { ru: [], 'en-orig': [], en: [] } }), 'ru');
    expect(tracks[0]).toEqual({ key: 'en-orig', auto: true });
    expect(tracks.map((t) => t.key)).toContain('ru');
  });

  it('ignores live chat and returns nothing when no subtitles exist', () => {
    expect(chooseSubtitleTracks(info({ subtitles: { live_chat: [] } }), 'ru')).toEqual([]);
  });
});
