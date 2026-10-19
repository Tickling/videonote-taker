export interface CapturedImage {
  imageData: string; // data URL
  width: number;
  height: number;
}

export interface IScreenshotService {
  captureFromVideo(videoElement: HTMLVideoElement): Promise<CapturedImage>;
  captureVisibleTab(): Promise<CapturedImage>;
}
