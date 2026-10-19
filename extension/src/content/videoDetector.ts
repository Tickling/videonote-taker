/** Главное видео страницы: самое большое видимое <video> с загруженными данными. */
export function findMainVideo(doc: Document = document): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const video of Array.from(doc.querySelectorAll('video'))) {
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea && video.readyState > 0) {
      best = video;
      bestArea = area;
    }
  }
  return best ?? doc.querySelector('video');
}

const TITLE_SUFFIXES = [/\s*[-|—]\s*YouTube$/i, /\s*[-|—]\s*RUTUBE$/i, /\s*\|\s*VK Видео$/i, /\s*[-|—]\s*VK$/i, /^\(\d+\)\s*/];

export function pageTitle(doc: Document = document): string {
  const og = doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  let title = (doc.title || og || '').trim();
  for (const re of TITLE_SUFFIXES) title = title.replace(re, '');
  return title.trim() || og?.trim() || '';
}
