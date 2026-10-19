import { spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderr: string,
    readonly notFound: boolean,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export interface RunOptions {
  timeoutMs?: number;
  cwd?: string;
}

/** Запуск внешней программы без shell (аргументы не интерпретируются — нет инъекций). */
export function runCommand(bin: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // yt-dlp (Python) на Windows иначе пишет ошибки в кодировке консоли (cp866/cp1251)
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
    const child = spawn(bin, args, { cwd: options.cwd, windowsHide: true, env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      reject(new CommandError(error.message, bin, null, '', error.code === 'ENOENT'));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (timedOut) reject(new CommandError(`${bin} timed out`, bin, code, stderr, false));
      else if (code !== 0) reject(new CommandError(`${bin} exited with code ${code}`, bin, code, stderr, false));
      else resolve({ stdout, stderr });
    });
  });
}
