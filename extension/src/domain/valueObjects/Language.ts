export interface LanguageOption {
  code: string;
  name: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'ru', name: 'Русский' },
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'be', name: 'Беларуская' },
  { code: 'kk', name: 'Қазақ' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

export class Language {
  readonly code: string;

  constructor(code: string) {
    const normalized = code.trim().toLowerCase().slice(0, 2);
    if (!Language.isSupported(normalized)) throw new Error(`Unsupported language: ${code}`);
    this.code = normalized;
  }

  static isSupported(code: string): boolean {
    return SUPPORTED_LANGUAGES.some((l) => l.code === code);
  }

  static default(): Language {
    return new Language('ru');
  }

  get name(): string {
    return SUPPORTED_LANGUAGES.find((l) => l.code === this.code)?.name ?? this.code;
  }
}
