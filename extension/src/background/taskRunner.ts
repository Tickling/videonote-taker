import { DomainError, MissingApiKeyError } from '@domain/errors';
import type { ProgressUpdate } from '@domain/ports/ITranscriptionService';
import { VideoUrl } from '@domain/valueObjects/VideoUrl';
import type { VideoType } from '@domain/valueObjects/VideoType';
import type { createBackgroundContainer } from '@infrastructure/container';
import { taskKey, type TaskState } from '@infrastructure/messaging/messages';

type Container = ReturnType<typeof createBackgroundContainer>;

export function toErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) };
}

/** Фоновые задачи «транскрипт + конспект»: состояние пишется в storage, UI подписывается. */
export class TaskRunner {
  private readonly running = new Set<string>();

  constructor(private readonly c: Container) {}

  isRunning(noteId: string): boolean {
    return this.running.has(noteId);
  }

  async createNote(params: { url: string; language: string; videoType: VideoType; title?: string }): Promise<string> {
    const noteId = new VideoUrl(params.url).getKey();
    if (this.running.has(noteId)) return noteId;
    this.running.add(noteId);
    void this.runCreate(noteId, params).finally(() => this.running.delete(noteId));
    return noteId;
  }

  async generateSummary(params: { noteId: string; videoType?: VideoType; language?: string }): Promise<string> {
    if (this.running.has(params.noteId)) return params.noteId;
    this.running.add(params.noteId);
    void this.runSummary(params, 0, 100, 'summary').finally(() => this.running.delete(params.noteId));
    return params.noteId;
  }

  private async runCreate(
    noteId: string,
    params: { url: string; language: string; videoType: VideoType; title?: string },
  ): Promise<void> {
    const log = this.c.logger.child('task');
    await this.setTask({ noteId, kind: 'create', status: 'running', progress: 1, stage: 'Начинаем…' });
    try {
      await this.c.transcribeVideo.execute({
        ...params,
        onProgress: (p) => void this.progress(noteId, 'create', p, 0, 70),
      });
    } catch (error) {
      log.warn('transcription failed', { noteId, error: String(error) });
      await this.setTask({ noteId, kind: 'create', status: 'failed', progress: 0, stage: 'Ошибка', error: toErrorPayload(error) });
      return;
    }
    await this.runSummary({ noteId, videoType: params.videoType, language: params.language }, 70, 30, 'create');
  }

  private async runSummary(
    params: { noteId: string; videoType?: VideoType; language?: string },
    base: number,
    span: number,
    kind: TaskState['kind'],
  ): Promise<void> {
    const { noteId } = params;
    await this.setTask({ noteId, kind, status: 'running', progress: base, stage: 'Пишем конспект…' });
    try {
      await this.c.generateSummary.execute({
        ...params,
        onProgress: (p) => void this.progress(noteId, kind, p, base, span),
      });
      await this.setTask({ noteId, kind, status: 'completed', progress: 100, stage: 'Готово' });
    } catch (error) {
      this.c.logger.warn('summary failed', { noteId, error: String(error) });
      const payload = toErrorPayload(error);
      if (kind === 'create') {
        // Транскрипт уже сохранён — это частичный успех
        await this.setTask({
          noteId,
          kind,
          status: 'completed',
          progress: 100,
          stage: error instanceof MissingApiKeyError ? 'Транскрипт готов' : 'Транскрипт готов, конспект не создан',
          warning: payload,
        });
      } else {
        await this.setTask({ noteId, kind, status: 'failed', progress: 0, stage: 'Ошибка', error: payload });
      }
    }
  }

  private progress(noteId: string, kind: TaskState['kind'], p: ProgressUpdate, base: number, span: number): Promise<void> {
    const progress = Math.round(base + (Math.min(100, Math.max(0, p.progress)) / 100) * span);
    return this.setTask({ noteId, kind, status: 'running', progress: Math.max(1, progress), stage: p.stage });
  }

  private async setTask(state: Omit<TaskState, 'updatedAt'>): Promise<void> {
    // Каждый вызов chrome.storage продлевает жизнь service worker
    await chrome.storage.local.set({ [taskKey(state.noteId)]: { ...state, updatedAt: Date.now() } satisfies TaskState });
  }
}
