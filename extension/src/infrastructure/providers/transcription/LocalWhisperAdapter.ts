import type { IBackendClient } from '@domain/ports/IBackendClient';
import type { ITranscriptionService, TranscriptionInput, TranscriptionResult } from '@domain/ports/ITranscriptionService';
import type { BackendJobTranscriber } from './BackendJobTranscriber';

/** Локальный whisper.cpp, установленный рядом с backend (бесплатно, нужен мощный ПК). */
export class LocalWhisperAdapter implements ITranscriptionService {
  constructor(
    private readonly backend: IBackendClient,
    private readonly jobs: BackendJobTranscriber,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (input.audioBlob) {
      const offset = input.offsetSeconds ?? 0;
      const segments = await this.backend.transcribeChunk(input.audioBlob, offset, input.language);
      const end = segments.reduce((max, s) => Math.max(max, s.end.seconds), offset);
      return { segments, totalDuration: end, source: 'local_whisper', language: input.language };
    }
    return this.jobs.run(input, 'local_whisper');
  }
}
