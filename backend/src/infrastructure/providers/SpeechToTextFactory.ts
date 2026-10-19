import type { ILogger, ISpeechToText, ISpeechToTextFactory } from '../../domain/ports.js';
import type { FfmpegAudio } from '../adapters/FfmpegAudio.js';
import { LocalWhisperProvider } from './LocalWhisperProvider.js';
import { WhisperProvider } from './WhisperProvider.js';

export class SpeechToTextFactory implements ISpeechToTextFactory {
  constructor(
    private readonly ffmpeg: FfmpegAudio,
    private readonly local_: { bin: string; model: string } | null,
    private readonly logger: ILogger,
    private readonly openaiBaseUrl?: string,
  ) {}

  openai(apiKey: string): ISpeechToText {
    return new WhisperProvider(apiKey, this.ffmpeg, this.logger.child({ provider: 'whisper' }), this.openaiBaseUrl);
  }

  local(): ISpeechToText | null {
    if (!this.local_) return null;
    return new LocalWhisperProvider(this.local_.bin, this.local_.model, this.ffmpeg, this.logger.child({ provider: 'local_whisper' }));
  }

  get localConfigured(): boolean {
    return this.local_ !== null;
  }
}
