import type { CapturedImage, IScreenshotService } from '@domain/ports/IScreenshotService';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.85;

type TabCaptureRequester = () => Promise<string>;

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = dataUrl;
  });
}

/** Работает в content script: кадр видео через canvas, фоллбэк — снимок вкладки через background. */
export class CanvasScreenshotAdapter implements IScreenshotService {
  constructor(private readonly requestTabCapture: TabCaptureRequester) {}

  async captureFromVideo(video: HTMLVideoElement): Promise<CapturedImage> {
    if (!video.videoWidth || !video.videoHeight) throw new Error('Видео ещё не загрузилось');
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    ctx.drawImage(video, 0, 0, width, height);
    // Бросает SecurityError, если кадр cross-origin / защищён DRM
    const imageData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    if (isBlankFrame(ctx, width, height)) throw new Error('Кадр пустой (вероятно, защищён DRM)');
    return { imageData, width, height };
  }

  async captureVisibleTab(): Promise<CapturedImage> {
    const imageData = await this.requestTabCapture();
    const { width, height } = await loadImageSize(imageData);
    return { imageData, width, height };
  }
}

/** DRM-видео рисуется в canvas чёрным прямоугольником. */
function isBlankFrame(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const sample = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.floor(sample.length / 4 / 500) * 4);
  for (let i = 0; i < sample.length; i += step) {
    if ((sample[i] ?? 0) > 8 || (sample[i + 1] ?? 0) > 8 || (sample[i + 2] ?? 0) > 8) return false;
  }
  return true;
}
