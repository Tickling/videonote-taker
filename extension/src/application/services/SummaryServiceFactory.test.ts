import { describe, expect, it } from 'vitest';
import { MissingApiKeyError } from '@domain/errors';
import type { ISummaryService } from '@domain/ports/ISummaryService';
import { SummaryProvider } from '@domain/valueObjects/Providers';
import { DEFAULT_SETTINGS } from '@domain/valueObjects/UserSettings';
import { InMemorySettingsRepository } from '../testing/fakes';
import { SummaryServiceFactory } from './SummaryServiceFactory';

const groq = { generate: async () => { throw new Error('groq'); } } as ISummaryService;
const openai = { generate: async () => { throw new Error('openai'); } } as ISummaryService;

const factory = (patch: Partial<typeof DEFAULT_SETTINGS>) =>
  new SummaryServiceFactory(groq, openai, new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, ...patch }));

describe('SummaryServiceFactory', () => {
  it('uses Groq by default', async () => {
    const { service, provider } = await factory({ groqApiKey: 'gsk_1' }).getService();
    expect(service).toBe(groq);
    expect(provider).toBe(SummaryProvider.GROQ);
  });

  it('uses GPT-4o when selected and key is present', async () => {
    const { service } = await factory({ summaryProvider: SummaryProvider.OPENAI_GPT4O, openaiApiKey: 'sk-1' }).getService();
    expect(service).toBe(openai);
  });

  it('falls back to Groq when GPT-4o is selected without an OpenAI key', async () => {
    const { service } = await factory({ summaryProvider: SummaryProvider.OPENAI_GPT4O, groqApiKey: 'gsk_1' }).getService();
    expect(service).toBe(groq);
  });

  it('asks for a free Groq key when nothing is configured', async () => {
    await expect(factory({}).getService()).rejects.toThrow(MissingApiKeyError);
  });
});
