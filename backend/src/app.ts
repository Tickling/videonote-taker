import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ProcessVideoJobUseCase } from './application/ProcessVideoJobUseCase.js';
import { TranscribeChunkUseCase } from './application/TranscribeChunkUseCase.js';
import type { Env } from './config/env.js';
import { AppError, toAppError } from './domain/errors.js';
import type { ILogger } from './domain/ports.js';
import { FfmpegAudio } from './infrastructure/adapters/FfmpegAudio.js';
import { SubtitlesExtractorAdapter } from './infrastructure/adapters/SubtitlesExtractorAdapter.js';
import { WorkDirFactory } from './infrastructure/adapters/WorkDirFactory.js';
import { YtDlpAdapter } from './infrastructure/adapters/YtDlpAdapter.js';
import { createDb } from './infrastructure/db/client.js';
import { DrizzleJobRepository } from './infrastructure/db/JobRepository.js';
import { SummarizerFactory } from './infrastructure/providers/LlmSummarizer.js';
import { SpeechToTextFactory } from './infrastructure/providers/SpeechToTextFactory.js';
import { InMemoryJobQueue } from './infrastructure/queue/InMemoryJobQueue.js';
import { healthRoutes } from './routes/health.js';
import { transcribeRoutes } from './routes/transcribe.js';

function toOriginMatcher(pattern: string): string | RegExp {
  if (!pattern.includes('*')) return pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Ключи провайдеров не должны попадать в логи
      redact: ['req.headers["x-openai-api-key"]', 'req.headers["x-groq-api-key"]'],
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    bodyLimit: 1024 * 1024,
    trustProxy: env.TRUST_PROXY,
  });
  const logger = app.log as unknown as ILogger;

  await app.register(cors, {
    origin: env.CORS_ORIGINS.map(toOriginMatcher),
    allowedHeaders: ['Content-Type', 'X-OpenAI-Api-Key', 'X-Groq-Api-Key', 'X-Summary-Provider'],
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    // Ошибку отдаёт общий обработчик ниже (единый формат { error: { code, message } })
    errorResponseBuilder: (_req, context) =>
      new AppError('RATE_LIMITED', `Слишком много запросов с вашего адреса. Попробуйте через ${Math.ceil(context.ttl / 60000)} мин.`),
  });

  // Аудио-фрагменты real-time приходят «сырым» телом
  app.addContentTypeParser(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body),
  );

  app.setErrorHandler((error, request, reply) => {
    const fastifyError = error as { statusCode?: number; message?: string; validation?: unknown };
    const appError =
      error instanceof AppError
        ? error
        : fastifyError.statusCode && fastifyError.statusCode < 500
          ? new AppError('INVALID_REQUEST', fastifyError.message ?? 'Неверный запрос')
          : toAppError(error);
    const status = error instanceof AppError ? appError.httpStatus : (fastifyError.statusCode ?? appError.httpStatus);
    if (status >= 500) request.log.error({ err: error }, 'request failed');
    void reply.code(status).send({ error: appError.toJSON() });
  });

  // ---- Composition root ----
  const { db, close } = createDb(env.DATABASE_PATH);
  const repository = new DrizzleJobRepository(db);
  const interrupted = await repository.markInterrupted();
  if (interrupted > 0) logger.warn({ interrupted }, 'marked interrupted jobs');
  await repository.deleteOlderThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const ytDlp = new YtDlpAdapter(
    { bin: env.YTDLP_PATH, ffmpegPath: env.FFMPEG_PATH !== 'ffmpeg' ? env.FFMPEG_PATH : undefined, extraArgs: env.YTDLP_EXTRA_ARGS, proxy: env.YTDLP_PROXY, useNodeJsRuntime: env.YTDLP_USE_NODE_JS_RUNTIME },
    logger.child({ component: 'yt-dlp' }),
  );
  const ffmpeg = new FfmpegAudio(env.FFMPEG_PATH);
  const localWhisper =
    env.WHISPER_CPP_PATH && env.WHISPER_MODEL_PATH && existsSync(env.WHISPER_MODEL_PATH) ? { bin: env.WHISPER_CPP_PATH, model: env.WHISPER_MODEL_PATH } : null;
  if (env.WHISPER_CPP_PATH && !localWhisper) logger.warn({ model: env.WHISPER_MODEL_PATH }, 'local whisper model not found');
  const speech = new SpeechToTextFactory(ffmpeg, localWhisper, logger, env.OPENAI_BASE_URL);
  const workDirs = new WorkDirFactory(env.TMP_DIR);

  const processor = new ProcessVideoJobUseCase({
    info: ytDlp,
    subtitles: new SubtitlesExtractorAdapter(ytDlp, logger.child({ component: 'subtitles' })),
    audio: ytDlp,
    speech,
    summarizers: new SummarizerFactory(logger.child({ component: 'llm' }), env.GROQ_API_KEY ?? null, { groq: env.GROQ_BASE_URL, openai: env.OPENAI_BASE_URL }),
    workDirs,
    logger,
  });
  const queue = new InMemoryJobQueue(processor, repository, logger.child({ component: 'queue' }), env.MAX_CONCURRENT_JOBS, env.JOB_TTL_MINUTES * 60 * 1000);

  await app.register(healthRoutes({ ytDlp: () => ytDlp.version(), ffmpeg: () => ffmpeg.available(), localWhisper: localWhisper !== null }));
  await app.register(transcribeRoutes({ queue, allowedPlatforms: env.ALLOWED_PLATFORMS, jobsPerHour: env.JOBS_PER_HOUR_PER_IP, transcribeChunk: new TranscribeChunkUseCase(speech, workDirs, logger.child({ component: 'chunk' })) }));

  app.addHook('onClose', async () => {
    queue.stop();
    close();
  });
  app.decorate('jobQueue', queue);
  return app;
}
