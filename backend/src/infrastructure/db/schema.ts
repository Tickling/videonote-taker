import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// История задач: активная очередь — в памяти, сюда пишутся снимки состояния
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  videoUrl: text('video_url').notNull(),
  language: text('language').notNull(),
  videoType: text('video_type').notNull(),
  mode: text('mode').notNull().default('auto'),
  generateSummary: integer('generate_summary', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['queued', 'processing', 'completed', 'failed'] }).notNull(),
  progress: integer('progress').notNull().default(0),
  stage: text('stage').notNull().default(''),
  resultJson: text('result_json'),
  errorJson: text('error_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
