import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

// Схема создаётся при старте — пользователю не нужно запускать миграции вручную
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  video_url TEXT NOT NULL,
  language TEXT NOT NULL,
  video_type TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto',
  generate_summary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT '',
  result_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_created_at ON jobs (created_at);
`;

export function createDb(databasePath: string): { db: Db; close: () => void } {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(CREATE_TABLES);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}
