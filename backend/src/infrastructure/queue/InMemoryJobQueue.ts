import { randomUUID } from 'node:crypto';
import type { ProcessVideoJobUseCase } from '../../application/ProcessVideoJobUseCase.js';
import { toAppError } from '../../domain/errors.js';
import type { IJobRepository, ILogger } from '../../domain/ports.js';
import type { Credentials, Job, TranscriptionMode, VideoTypeId } from '../../domain/types.js';

export interface EnqueueParams {
  videoUrl: string;
  language: string;
  videoType: VideoTypeId;
  mode: TranscriptionMode;
  generateSummary: boolean;
}

interface Pending {
  job: Job;
  credentials: Credentials;
}

/** In-memory очередь с ограничением параллельности; снимки состояния — в SQLite. */
export class InMemoryJobQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly pending: Pending[] = [];
  private active = 0;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly processor: ProcessVideoJobUseCase,
    private readonly repository: IJobRepository,
    private readonly logger: ILogger,
    private readonly concurrency = 2,
    private readonly ttlMs = 60 * 60 * 1000,
  ) {
    this.cleanupTimer = setInterval(() => this.evictExpired(), 10 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  async enqueue(params: EnqueueParams, credentials: Credentials): Promise<Job> {
    const now = new Date();
    const job: Job = { id: randomUUID(), ...params, status: 'queued', progress: 0, stage: 'В очереди…', createdAt: now, updatedAt: now };
    this.jobs.set(job.id, job);
    await this.repository.save(job);
    this.pending.push({ job, credentials });
    this.logger.info({ jobId: job.id, url: job.videoUrl, mode: job.mode, queued: this.pending.length }, 'job enqueued');
    this.pump();
    return job;
  }

  async get(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? (await this.repository.findById(id));
  }

  /** Позиция в очереди (0 — уже обрабатывается) */
  queuePosition(id: string): number {
    return this.pending.findIndex((p) => p.job.id === id) + 1;
  }

  stop(): void {
    clearInterval(this.cleanupTimer);
  }

  async drain(): Promise<void> {
    while (this.active > 0 || this.pending.length > 0) await new Promise((r) => setTimeout(r, 20));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) break;
      this.active += 1;
      void this.run(next).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async run({ job, credentials }: Pending): Promise<void> {
    const log = this.logger.child({ jobId: job.id });
    const started = Date.now();
    this.update(job, { status: 'processing', progress: 1, stage: 'Начинаем…' });
    await this.repository.save(job);
    try {
      const result = await this.processor.execute(job, credentials, (progress, stage) => this.update(job, { progress, stage }));
      this.update(job, { status: 'completed', progress: 100, stage: 'Готово', result });
      log.info({ ms: Date.now() - started, segments: result.transcript.segments.length, source: result.transcript.source, summary: Boolean(result.summary) }, 'job completed');
    } catch (error) {
      const appError = toAppError(error);
      this.update(job, { status: 'failed', stage: 'Ошибка', error: appError.toJSON() });
      log.warn({ code: appError.code, err: appError.details ?? appError.message, ms: Date.now() - started }, 'job failed');
    }
    await this.repository.save(job).catch((error: unknown) => log.error({ err: String(error) }, 'job persist failed'));
  }

  private update(job: Job, patch: Partial<Job>): void {
    Object.assign(job, patch, { updatedAt: new Date() });
    if (patch.progress !== undefined) job.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if ((job.status === 'completed' || job.status === 'failed') && job.updatedAt.getTime() < cutoff) this.jobs.delete(id);
    }
  }
}
