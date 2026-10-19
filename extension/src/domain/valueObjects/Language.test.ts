import { describe, expect, it } from 'vitest';
import { Language } from './Language';

describe('Language', () => {
  it('normalizes codes', () => {
    expect(new Language('RU').code).toBe('ru');
    expect(new Language('en-US').code).toBe('en');
    expect(new Language('ru').name).toBe('Русский');
  });

  it('rejects unsupported languages', () => {
    expect(() => new Language('xx')).toThrow();
  });
});
