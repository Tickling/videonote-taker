// Чистые функции разбора URL видео. Используются доменом расширения и backend-ом.

export type PlatformId = 'youtube' | 'rutube' | 'vk_video';

export interface ParsedVideoUrl {
  platform: PlatformId;
  videoId: string;
  canonicalUrl: string;
}

const YOUTUBE_PATTERNS: RegExp[] = [
  /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/i,
  /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{6,})/i,
  /^(?:https?:\/\/)?youtu\.be\/([\w-]{6,})/i,
];

const RUTUBE_PATTERNS: RegExp[] = [
  /^(?:https?:\/\/)?(?:www\.)?rutube\.ru\/(?:video|shorts|play\/embed)\/(?:private\/)?([\da-f]{32}|\d+)/i,
];

// vk.com/video-123_456, vk.ru/video123_456, vkvideo.ru/video-123_456, vk.com/...?z=video-123_456
const VK_PATTERNS: RegExp[] = [
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:vk\.com|vk\.ru|vkvideo\.ru)\/(?:.*[?&]z=)?video(-?\d+)_(\d+)/i,
];

function firstMatch(patterns: RegExp[], value: string): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match;
  }
  return null;
}

export function parseVideoUrl(raw: string): ParsedVideoUrl | null {
  const value = raw.trim();

  const yt = firstMatch(YOUTUBE_PATTERNS, value);
  if (yt?.[1]) {
    return {
      platform: 'youtube',
      videoId: yt[1],
      canonicalUrl: `https://www.youtube.com/watch?v=${yt[1]}`,
    };
  }

  const rt = firstMatch(RUTUBE_PATTERNS, value);
  if (rt?.[1]) {
    return {
      platform: 'rutube',
      videoId: rt[1],
      canonicalUrl: `https://rutube.ru/video/${rt[1]}/`,
    };
  }

  const vk = firstMatch(VK_PATTERNS, value);
  if (vk?.[1] && vk[2]) {
    const id = `${vk[1]}_${vk[2]}`;
    return { platform: 'vk_video', videoId: id, canonicalUrl: `https://vkvideo.ru/video${id}` };
  }

  return null;
}

export function buildTimestampUrl(parsed: ParsedVideoUrl, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  switch (parsed.platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${parsed.videoId}&t=${t}s`;
    case 'rutube':
      return `https://rutube.ru/video/${parsed.videoId}/?t=${t}`;
    case 'vk_video':
      return `https://vkvideo.ru/video${parsed.videoId}?t=${t}`;
  }
}
