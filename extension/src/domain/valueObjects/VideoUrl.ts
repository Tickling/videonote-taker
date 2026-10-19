import { buildTimestampUrl, parseVideoUrl, type ParsedVideoUrl } from '@shared/videoUrl';
import { UnsupportedVideoUrlError } from '../errors';
import type { Timestamp } from './Timestamp';
import { VideoPlatform } from './VideoPlatform';

const PLATFORM_MAP: Record<ParsedVideoUrl['platform'], VideoPlatform> = {
  youtube: VideoPlatform.YOUTUBE,
  rutube: VideoPlatform.RUTUBE,
  vk_video: VideoPlatform.VK_VIDEO,
};

export class VideoUrl {
  readonly value: string;
  private readonly parsed: ParsedVideoUrl;

  constructor(value: string) {
    const parsed = parseVideoUrl(value);
    if (!parsed) throw new UnsupportedVideoUrlError(value);
    this.value = value.trim();
    this.parsed = parsed;
  }

  static isSupported(value: string): boolean {
    return parseVideoUrl(value) !== null;
  }

  static tryCreate(value: string): VideoUrl | null {
    return VideoUrl.isSupported(value) ? new VideoUrl(value) : null;
  }

  getPlatform(): VideoPlatform {
    return PLATFORM_MAP[this.parsed.platform];
  }

  getVideoId(): string {
    return this.parsed.videoId;
  }

  /** Нормализованная ссылка без лишних параметров. */
  getCanonicalUrl(): string {
    return this.parsed.canonicalUrl;
  }

  /** Стабильный ключ видео: одна заметка на одно видео. */
  getKey(): string {
    return `${this.parsed.platform}_${this.parsed.videoId}`;
  }

  getTimestampUrl(timestamp: Timestamp): string {
    return buildTimestampUrl(this.parsed, timestamp.seconds);
  }

  equals(other: VideoUrl): boolean {
    return this.getKey() === other.getKey();
  }
}
