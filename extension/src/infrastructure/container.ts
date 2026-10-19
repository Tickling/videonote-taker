// Composition root: сборка зависимостей для каждого контекста расширения.
import { TranscriptionChain } from '@application/services/TranscriptionChain';
import { SummaryServiceFactory } from '@application/services/SummaryServiceFactory';
import { TranscribeVideoUseCase } from '@application/useCases/TranscribeVideoUseCase';
import { GenerateSummaryUseCase } from '@application/useCases/GenerateSummaryUseCase';
import { RealtimeTranscriptionUseCase } from '@application/useCases/RealtimeTranscriptionUseCase';
import { SaveSettingsUseCase } from '@application/useCases/SaveSettingsUseCase';
import { DeleteNoteUseCase, ListNotesUseCase, SaveNoteUseCase } from '@application/useCases/NoteUseCases';
import { ExportToMarkdownUseCase, ExportToWordUseCase } from '@application/useCases/ExportUseCases';
import { ApiKeyValidator } from './adapters/ApiKeyValidator';
import { BackendAPIAdapter } from './adapters/BackendAPIAdapter';
import { ChromeStorageNoteRepository, ChromeStorageSettingsRepository } from './adapters/ChromeStorageAdapter';
import { MarkdownExporter } from './exporters/MarkdownExporter';
import { WordExporter } from './exporters/WordExporter';
import { ConsoleLogger } from './logging/ConsoleLogger';
import { GroqProvider } from './providers/llm/GroqProvider';
import { OpenAIProvider } from './providers/llm/OpenAIProvider';
import { BackendJobTranscriber } from './providers/transcription/BackendJobTranscriber';
import { LocalWhisperAdapter } from './providers/transcription/LocalWhisperAdapter';
import { SubtitlesExtractorAdapter } from './providers/transcription/SubtitlesExtractorAdapter';
import { WhisperAPIAdapter } from './providers/transcription/WhisperAPIAdapter';

export function createBackgroundContainer() {
  const logger = new ConsoleLogger('background');
  const settings = new ChromeStorageSettingsRepository();
  const notes = new ChromeStorageNoteRepository();
  const backend = new BackendAPIAdapter(settings, logger.child('backend'));
  const jobs = new BackendJobTranscriber(backend, logger.child('jobs'));

  const chain = new TranscriptionChain(
    new SubtitlesExtractorAdapter(jobs),
    new WhisperAPIAdapter(settings, jobs),
    new LocalWhisperAdapter(backend, jobs),
    settings,
    logger.child('transcription'),
  );
  const summaryFactory = new SummaryServiceFactory(
    new GroqProvider(settings, logger.child('groq')),
    new OpenAIProvider(settings, logger.child('openai')),
    settings,
  );

  return {
    logger,
    settings,
    notes,
    transcribeVideo: new TranscribeVideoUseCase(chain, notes, logger.child('transcribe')),
    generateSummary: new GenerateSummaryUseCase(summaryFactory, notes, logger.child('summary')),
    realtime: new RealtimeTranscriptionUseCase(chain, notes, logger.child('realtime')),
  };
}

export function createUiContainer(scope: string) {
  const logger = new ConsoleLogger(scope);
  const settings = new ChromeStorageSettingsRepository();
  const notes = new ChromeStorageNoteRepository();
  return {
    logger,
    settings,
    notes,
    backend: new BackendAPIAdapter(settings, logger.child('backend')),
    saveSettings: new SaveSettingsUseCase(settings, new ApiKeyValidator()),
    listNotes: new ListNotesUseCase(notes),
    deleteNote: new DeleteNoteUseCase(notes),
    saveNote: new SaveNoteUseCase(notes),
    exportWord: new ExportToWordUseCase(new WordExporter(), notes),
    exportMarkdown: new ExportToMarkdownUseCase(new MarkdownExporter(), notes),
  };
}

export type UiContainer = ReturnType<typeof createUiContainer>;
