import { AppError, SubtitlesNotFoundError, toAppError } from '../domain/errors.js';
import type {
  IAudioDownloader,
  ILogger,
  ISpeechToTextFactory,
  ISubtitlesExtractor,
  ISummarizerFactory,
  IVideoInfoProvider,
  IWorkDirFactory,
} from '../domain/ports.js';
import type { Credentials, Job, JobResult, ProgressReporter, Transcript, TranscriptSource } from '../domain/types.js';

export interface ProcessVideoDeps {
  info: IVideoInfoProvider;
  subtitles: ISubtitlesExtractor;
  audio: IAudioDownloader;
  speech: ISpeechToTextFactory;
  summarizers: ISummarizerFactory;
  workDirs: IWorkDirFactory;
  logger: ILogger;
}

/**
 * Пайплайн задачи «по ссылке»:
 * информация о видео → субтитры (бесплатно) → Whisper (если выбран) → конспект (если запрошен).
 */
export class ProcessVideoJobUseCase {
  constructor(private readonly deps: ProcessVideoDeps) {}

  async execute(job: Job, credentials: Credentials, report: ProgressReporter): Promise<JobResult> {
    const log = this.deps.logger.child({ jobId: job.id });
    const workDir = await this.deps.workDirs.create(job.id);
    try {
      report(5, 'Получаем информацию о видео…');
      const info = await this.deps.info.getInfo(job.videoUrl);
      log.info({ title: info.title, duration: info.duration }, 'video info');

      const transcript = await this.transcribe(job, credentials, info, workDir.path, report);
      transcript.totalDuration ||= info.duration;
      const result: JobResult = { title: info.title, transcript };

      if (job.generateSummary) {
        const summarizer = this.deps.summarizers.create(credentials);
        if (!summarizer) {
          result.summaryError = { code: 'MISSING_API_KEY', message: 'Для конспекта нужен ключ Groq (бесплатно) или OpenAI.' };
        } else {
          report(80, 'Пишем конспект…');
          try {
            result.summary = await summarizer.summarize(transcript, job.videoType, job.language, info.title, (p, stage) =>
              report(80 + Math.round(p * 0.19), stage),
            );
          } catch (error) {
            const appError = toAppError(error);
            log.warn({ err: appError.details ?? appError.message }, 'summary failed');
            result.summaryError = appError.toJSON();
          }
        }
      }
      report(100, 'Готово');
      return result;
    } finally {
      await workDir.cleanup().catch((error: unknown) => log.warn({ err: String(error) }, 'cleanup failed'));
    }
  }

  private async transcribe(
    job: Job,
    credentials: Credentials,
    info: Awaited<ReturnType<IVideoInfoProvider['getInfo']>>,
    workDir: string,
    report: ProgressReporter,
  ): Promise<Transcript> {
    if (job.mode === 'subtitles' || job.mode === 'auto') {
      report(15, 'Скачиваем субтитры…');
      const transcript = await this.deps.subtitles.extract(job.videoUrl, info, job.language, workDir);
      if (transcript && transcript.segments.length > 0) return transcript;
      if (job.mode === 'subtitles') throw new SubtitlesNotFoundError();
      // auto: идём к Whisper, только если есть чем
      if (!credentials.openaiApiKey && !this.deps.speech.local()) throw new SubtitlesNotFoundError();
    }

    const useLocal = job.mode === 'local_whisper' || (job.mode === 'auto' && !credentials.openaiApiKey);
    let source: TranscriptSource;
    let engine;
    if (useLocal) {
      engine = this.deps.speech.local();
      if (!engine) {
        throw new AppError(
          'LOCAL_WHISPER_NOT_CONFIGURED',
          'Локальный Whisper не настроен: укажите WHISPER_CPP_PATH и WHISPER_MODEL_PATH в файле backend/.env (см. инструкцию).',
        );
      }
      source = 'local_whisper';
    } else {
      if (!credentials.openaiApiKey) throw new AppError('MISSING_API_KEY', 'Для Whisper нужен API-ключ OpenAI. Добавьте его в настройках ⚙️.');
      engine = this.deps.speech.openai(credentials.openaiApiKey);
      source = 'whisper';
    }

    report(25, 'Скачиваем аудио…');
    const audioPath = await this.deps.audio.download(job.videoUrl, workDir);
    report(40, 'Распознаём речь…');
    const segments = await engine.transcribe(audioPath, job.language, (done, total) =>
      report(40 + Math.round((done / total) * 38), `Распознаём речь: часть ${Math.min(done + 1, total)} из ${total}…`),
    );
    if (segments.length === 0) throw new AppError('TRANSCRIPTION_FAILED', 'В видео не удалось распознать речь.');
    const end = segments[segments.length - 1]?.end ?? 0;
    return { segments, source, totalDuration: Math.max(info.duration, end), language: job.language };
  }
}
