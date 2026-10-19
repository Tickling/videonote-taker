// Шаблоны промптов по типам видео живут в shared/src/prompts.ts —
// одни и те же для расширения и backend (Groq Llama 3.3 и GPT-4o).
export { buildSummaryPrompt, buildMergePrompt, formatTranscriptForPrompt, languageName } from '@shared/prompts';
export type { ChatPrompt, SummaryPromptInput } from '@shared/prompts';
