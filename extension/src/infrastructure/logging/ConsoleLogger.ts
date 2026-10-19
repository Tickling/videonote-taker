import type { ILogger, LogFields } from '@domain/ports/ILogger';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Структурированный JSON-лог в консоль соответствующего контекста расширения. */
export class ConsoleLogger implements ILogger {
  constructor(private readonly scope: string) {}

  debug(msg: string, fields?: LogFields): void {
    this.write('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.write('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write('error', msg, fields);
  }
  child(scope: string): ILogger {
    return new ConsoleLogger(`${this.scope}.${scope}`);
  }

  private write(level: Level, msg: string, fields?: LogFields): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, scope: this.scope, msg, ...fields });
    // eslint-disable-next-line no-console
    console[level](line);
  }
}
