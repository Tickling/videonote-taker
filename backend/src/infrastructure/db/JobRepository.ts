import { eq, inArray, lt } from 'drizzle-orm';
import type { IJobRepository } from '../../domain/ports.js';
import type { Job, JobResult, TranscriptionMode, VideoTypeId } from '../../domain/types.js';
import type { Db } from './client.js';
import { jobs, type JobRow } from './schema.js';

function toRow(job: Job): JobRow {
  return {
    id: job.id,
    videoUrl: job.videoUrl,
    language: job.language,
    videoType: job.videoType,
    mode: job.mode,
    generateSummary: job.generateSummary,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    resultJson: job.result ? JSON.stringify(job.result) : null,
    errorJson: job.error ? JSON.stringify(job.error) : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function fromRow(row: JobRow): Job {
  return {
    id: row.id,
    videoUrl: row.videoUrl,
    language: row.language,
    videoType: row.videoType as VideoTypeId,
    mode: row.mode as TranscriptionMode,
    generateSummary: row.generateSummary,
    status: row.status,
    progress: row.progress,
    stage: row.stage,
    ...(row.resultJson ? { result: JSON.parse(row.resultJson) as JobResult } : {}),
    ...(row.errorJson ? { error: JSON.parse(row.errorJson) as { code: string; message: string } } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleJobRepository implements IJobRepository {
  constructor(private readonly db: Db) {}

  async save(job: Job): Promise<void> {
    const row = toRow(job);
    this.db.insert(jobs).values(row).onConflictDoUpdate({ target: jobs.id, set: row }).run();
  }

  async findById(id: string): Promise<Job | null> {
    const row = this.db.select().from(jobs).where(eq(jobs.id, id)).get();
    return row ? fromRow(row) : null;
  }

  /** После перезапуска сервера незавершённые задачи помечаются как прерванные. */
  async markInterrupted(): Promise<number> {
    const result = this.db
      .update(jobs)
      .set({
        status: 'failed',
        errorJson: JSON.stringify({ code: 'INTERRUPTED', message: 'Сервер был перезапущен во время обработки. Повторите запрос.' }),
        updatedAt: new Date(),
      })
      .where(inArray(jobs.status, ['queued', 'processing']))
      .run();
    return result.changes;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    return this.db.delete(jobs).where(lt(jobs.createdAt, date)).run().changes;
  }
}
