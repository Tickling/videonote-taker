import type { FastifyInstance } from 'fastify';
import { parseVideoUrl } from '@shared/videoUrl.js';
import type { TranscribeChunkUseCase } from '../application/TranscribeChunkUseCase.js';
import { AppError } from '../domain/errors.js';
import type { InMemoryJobQueue } from '../infrastructure/queue/InMemoryJobQueue.js';
import { ChunkQuery, credentialsFrom, TranscribeByUrlBody } from './schemas.js';

const ESTIMATED_SECONDS = { auto: 30, subtitles: 15, whisper: 180, local_whisper: 600 } as const;

export function transcribeRoutes(deps: { queue: InMemoryJobQueue; transcribeChunk: TranscribeChunkUseCase }) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post('/api/transcribe-by-url', async (request, reply) => {
      const parsed = TranscribeByUrlBody.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError('INVALID_REQUEST', parsed.error.issues.map((i) => i.message).join('; '));
      }
      const body = parsed.data;
      const canonical = parseVideoUrl(body.videoUrl)?.canonicalUrl ?? body.videoUrl;
      const job = await deps.queue.enqueue(
        { videoUrl: canonical, language: body.language, videoType: body.videoType, mode: body.transcriptionMode, generateSummary: body.generateSummary },
        credentialsFrom(request.headers),
      );
      return reply.code(202).send({ jobId: job.id, status: 'processing', estimatedTime: ESTIMATED_SECONDS[body.transcriptionMode] });
    });

    app.get<{ Params: { jobId: string } }>('/api/jobs/:jobId', async (request) => {
      const job = await deps.queue.get(request.params.jobId);
      if (!job) throw new AppError('JOB_NOT_FOUND', 'Задача не найдена (возможно, устарела). Запустите обработку заново.');
      const position = deps.queue.queuePosition(job.id);
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        stage: position > 0 ? `В очереди: ${position}…` : job.stage,
        ...(job.result ? { result: job.result } : {}),
        ...(job.error ? { error: job.error } : {}),
      };
    });

    // Real-time: тело запроса — аудио-фрагмент (webm/ogg/mp4)
    app.post('/api/transcribe-chunk', { bodyLimit: 25 * 1024 * 1024 }, async (request) => {
      const query = ChunkQuery.safeParse(request.query);
      if (!query.success) throw new AppError('INVALID_REQUEST', 'Неверные параметры фрагмента');
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new AppError('INVALID_REQUEST', 'Пустой аудио-фрагмент');
      const contentType = request.headers['content-type'] ?? 'audio/webm';
      const extension = contentType.includes('ogg') ? 'ogg' : contentType.includes('mp4') ? 'mp4' : contentType.includes('wav') ? 'wav' : 'webm';
      const segments = await deps.transcribeChunk.execute({
        audio: request.body,
        extension,
        start: query.data.start,
        language: query.data.language,
        mode: query.data.mode,
        openaiApiKey: credentialsFrom(request.headers).openaiApiKey,
      });
      return { segments };
    });
  };
}
