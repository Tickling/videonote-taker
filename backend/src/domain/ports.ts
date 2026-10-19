import type { Credentials, Job, ProgressReporter, Segment, SummaryResult, Transcript, VideoInfo, VideoTypeId } from './types.js';

export interface ILogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  child(bindings: Record<string, unknown>): ILogger;
}

export interface IVideoInfoProvider {
  getInfo(url: string): Promise<VideoInfo>;
}

export interface ISubtitlesExtractor {
  /** null — субтитров нет */
  extract(url: string, info: VideoInfo, language: string, workDir: string): Promise<Transcript | null>;
}

export interface IAudioDownloader {
  /** Скачивает аудиодорожку, возвращает путь к файлу */
  download(url: string, workDir: string): Promise<string>;
}

export interface ISpeechToText {
  transcribe(audioPath: string, language: string, onProgress?: (done: number, total: number) => void): Promise<Segment[]>;
}

export interface ISpeechToTextFactory {
  openai(apiKey: string): ISpeechToText;
  local(): ISpeechToText | null;
}

export interface ISummarizer {
  summarize(transcript: Transcript, videoType: VideoTypeId, language: string, title: string | undefined, onProgress?: ProgressReporter): Promise<SummaryResult>;
}

export interface ISummarizerFactory {
  /** null — нет ни одного ключа */
  create(credentials: Credentials): ISummarizer | null;
}

export interface IJobRepository {
  save(job: Job): Promise<void>;
  findById(id: string): Promise<Job | null>;
  markInterrupted(): Promise<number>;
}

export interface IWorkDirFactory {
  create(prefix: string): Promise<{ path: string; cleanup: () => Promise<void> }>;
}
