import type { FastifyInstance } from 'fastify';

export interface HealthChecks {
  ytDlp: () => Promise<string | null>;
  ffmpeg: () => Promise<boolean>;
  localWhisper: boolean;
}

export function healthRoutes(checks: HealthChecks) {
  let cache: { at: number; value: { ytDlp: boolean; ytDlpVersion: string | null; ffmpeg: boolean } } | null = null;
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/health', async () => {
      if (!cache || Date.now() - cache.at > 60_000) {
        const [version, ffmpeg] = await Promise.all([checks.ytDlp(), checks.ffmpeg()]);
        cache = { at: Date.now(), value: { ytDlp: version !== null, ytDlpVersion: version, ffmpeg } };
      }
      return { ok: true, status: 'ok', uptime: process.uptime(), ...cache.value, localWhisper: checks.localWhisper };
    });
  };
}
