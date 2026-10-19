import type { VideoType } from '@domain/valueObjects/VideoType';
import { sendToBackground, type GuideName } from '@infrastructure/messaging/messages';

export function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

export function openGuide(guide: GuideName): void {
  void sendToBackground({ type: 'open-guide', guide });
}

export function startCreateNote(params: { url: string; language: string; videoType: VideoType; title?: string }): Promise<{ noteId: string }> {
  return sendToBackground<{ noteId: string }>({ type: 'create-note', ...params });
}

export function startSummary(params: { noteId: string; videoType?: VideoType; language?: string }): Promise<{ noteId: string }> {
  return sendToBackground<{ noteId: string }>({ type: 'generate-summary', ...params });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Скачивание через background (chrome.downloads): имя файла сохраняется везде —
 * в popup (который может закрыться) и в sidebar-iframe на странице видео.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  await sendToBackground({ type: 'download', dataUrl: await blobToDataUrl(blob), filename });
}
