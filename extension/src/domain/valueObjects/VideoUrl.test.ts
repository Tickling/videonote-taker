import { describe, expect, it } from 'vitest';
import { UnsupportedVideoUrlError } from '../errors';
import { Timestamp } from './Timestamp';
import { VideoPlatform } from './VideoPlatform';
import { VideoUrl } from './VideoUrl';

describe('VideoUrl', () => {
  describe('YouTube', () => {
    it.each([
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
      ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ])('parses %s', (url, id) => {
      const videoUrl = new VideoUrl(url);
      expect(videoUrl.getPlatform()).toBe(VideoPlatform.YOUTUBE);
      expect(videoUrl.getVideoId()).toBe(id);
      expect(videoUrl.getCanonicalUrl()).toBe(`https://www.youtube.com/watch?v=${id}`);
    });

    it('builds timestamp url that keeps the video id', () => {
      const url = new VideoUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(url.getTimestampUrl(new Timestamp(125.7))).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=125s',
      );
    });
  });

  describe('Rutube', () => {
    const id = 'c6cc4d620b1d4338901770a44b3e82f4';
    it.each([
      `https://rutube.ru/video/${id}/`,
      `https://rutube.ru/video/${id}/?r=wd`,
      `rutube.ru/video/${id}`,
      `https://rutube.ru/shorts/${id}/`,
      `https://rutube.ru/video/private/${id}/?p=key`,
    ])('parses %s', (url) => {
      const videoUrl = new VideoUrl(url);
      expect(videoUrl.getPlatform()).toBe(VideoPlatform.RUTUBE);
      expect(videoUrl.getVideoId()).toBe(id);
    });

    it('builds timestamp url', () => {
      expect(new VideoUrl(`https://rutube.ru/video/${id}/`).getTimestampUrl(new Timestamp(90))).toBe(
        `https://rutube.ru/video/${id}/?t=90`,
      );
    });
  });

  describe('VK Video', () => {
    it.each([
      ['https://vk.com/video-22822305_456242146', '-22822305_456242146'],
      ['https://vk.ru/video-22822305_456242146', '-22822305_456242146'],
      ['https://vkvideo.ru/video-22822305_456242146', '-22822305_456242146'],
      ['https://vk.com/video12345_678', '12345_678'],
      ['https://vk.com/videos-1?z=video-22822305_456242146%2Fpl_-1', '-22822305_456242146'],
    ])('parses %s', (url, id) => {
      const videoUrl = new VideoUrl(url);
      expect(videoUrl.getPlatform()).toBe(VideoPlatform.VK_VIDEO);
      expect(videoUrl.getVideoId()).toBe(id);
    });
  });

  it.each([
    'https://example.com/video/1',
    'https://www.youtube.com/',
    'https://www.youtube.com/@channel',
    'https://rutube.ru/channel/123/',
    'https://vk.com/id1',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(() => new VideoUrl(url)).toThrow(UnsupportedVideoUrlError);
    expect(VideoUrl.isSupported(url)).toBe(false);
  });

  it('gives the same key for different links to the same video', () => {
    const a = new VideoUrl('https://youtu.be/dQw4w9WgXcQ');
    const b = new VideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s');
    expect(a.getKey()).toBe('youtube_dQw4w9WgXcQ');
    expect(a.equals(b)).toBe(true);
  });
});
