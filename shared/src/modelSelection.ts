// Выбор модели у провайдера: модели регулярно выводятся из эксплуатации
// (Groq отключил llama-3.3-70b-versatile 16.08.2026), поэтому список доступных
// моделей запрашивается у API, а при ошибке «модель не найдена» берётся следующая.

/** Порядок предпочтения для бесплатного Groq (лучшие для конспектов — первыми). */
export const GROQ_MODEL_PREFERENCE = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

// Не чат-модели (распознавание речи, модерация, синтез речи, агенты)
const NOT_CHAT = /whisper|guard|tts|playai|orpheus|safeguard|compound|distil|embed/i;

/** Кандидаты в порядке попытки: предпочтительные из доступных, затем прочие чат-модели. */
export function rankModels(preference: readonly string[], available: readonly string[] | null): string[] {
  if (!available || available.length === 0) return [...preference];
  const set = new Set(available);
  const preferred = preference.filter((m) => set.has(m));
  const others = available.filter((m) => !preference.includes(m) && !NOT_CHAT.test(m)).sort();
  const ranked = [...preferred, ...others];
  return ranked.length > 0 ? ranked : [...preference];
}

/** «Рассуждающим» моделям ограничиваем рассуждения — иначе они съедают лимит токенов. */
export function reasoningParams(model: string): Record<string, string> {
  return /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {};
}

/** Ошибка API означает «этой модели нет / она отключена» — стоит попробовать следующую. */
export function isModelUnavailable(status: number | undefined, message: string): boolean {
  if (status === 404) return true;
  return status === 400 && /model.*(decommission|deprecat|not found|does not exist|not supported)/i.test(message);
}

/** Модели без JSON-режима отвечают 400 на response_format — тогда повторяем без него. */
export function isJsonModeUnsupported(status: number | undefined, message: string): boolean {
  return status === 400 && /response_format|json_object|json mode/i.test(message);
}
