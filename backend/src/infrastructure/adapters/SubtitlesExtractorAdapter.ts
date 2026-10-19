import { readFile } from 'node:fs/promises';
import type { ILogger, ISubtitlesExtractor } from '../../domain/ports.js';
import type { Transcript, VideoInfo } from '../../domain/types.js';
import { parseSubtitles } from './subtitleParser.js';
import { chooseSubtitleTracks, type YtDlpAdapter } from './YtDlpAdapter.js';

/** Бесплатная транскрибация: готовые/автоматические субтитры через yt-dlp. */
export class SubtitlesExtractorAdapter implements ISubtitlesExtractor {
  constructor(
    private readonly ytDlp: YtDlpAdapter,
    private readonly logger: ILogger,
  ) {}

  async extract(url: string, info: VideoInfo, language: string, workDir: string): Promise<Transcript | null> {
    const tracks = chooseSubtitleTracks(info, language).slice(0, 3);
    this.logger.info({ tracks }, 'subtitle candidates');
    for (const track of tracks) {
      const path = await this.ytDlp.downloadSubtitles(url, track, workDir);
      if (!path) continue;
      const segments = parseSubtitles(await readFile(path, 'utf8'));
      if (segments.length > 0) {
        return {
          segments,
          source: 'subtitles',
          totalDuration: Math.max(info.duration, segments[segments.length - 1]?.end ?? 0),
          language: track.key.split(/[-_]/)[0] ?? language,
        };
      }
    }
    return null;
  }
}
