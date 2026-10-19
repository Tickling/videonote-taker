import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { IWorkDirFactory } from '../../domain/ports.js';

/** Временные папки задач; удаляются после обработки. */
export class WorkDirFactory implements IWorkDirFactory {
  constructor(private readonly root: string) {}

  async create(prefix: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
    await mkdir(this.root, { recursive: true });
    const path = await mkdtemp(join(this.root, `${prefix.replace(/[^\w-]/g, '').slice(0, 40)}-`));
    return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
  }
}
