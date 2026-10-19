import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Только локальный доступ по умолчанию: сервер личный
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('chrome-extension://*,http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  DATABASE_PATH: z.string().default('./data/videonote.sqlite'),
  TMP_DIR: z.string().default('./tmp'),
  YTDLP_PATH: z.string().default('yt-dlp'),
  YTDLP_EXTRA_ARGS: z
    .string()
    .default('')
    .transform((v) => v.split(' ').filter(Boolean)),
  YTDLP_USE_NODE_JS_RUNTIME: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  WHISPER_CPP_PATH: optionalString,
  WHISPER_MODEL_PATH: optionalString,
  // Необязательный ключ Groq владельца сервера (если пользователь не указал свой)
  GROQ_API_KEY: optionalString,
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(10).default(2),
  JOB_TTL_MINUTES: z.coerce.number().int().min(1).default(60),
  // Для тестов: подмена адресов провайдеров
  GROQ_BASE_URL: optionalString,
  OPENAI_BASE_URL: optionalString,
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
