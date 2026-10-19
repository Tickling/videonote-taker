// Настройки сборки (задаются переменными окружения Vite при `vite build`).
import { DEFAULT_BACKEND_URL } from '@domain/valueObjects/UserSettings';

export const buildConfig = {
  /** Адрес сервера по умолчанию: локальный или публичный (сборка для Chrome Web Store). */
  defaultBackendUrl: import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL,
  /**
   * Сборка для Chrome Web Store: видео YouTube обрабатываются только в браузере
   * (правила магазина запрещают скачивание видео с YouTube; сервер — для Rutube и VK).
   */
  storeBuild: import.meta.env.VITE_STORE_BUILD === 'true',
  /** Только YouTube, без сервера (сборка для Chrome Web Store; Rutube/VK — позже) */
  youtubeOnly: import.meta.env.VITE_STORE_BUILD === 'true' || import.meta.env.VITE_YOUTUBE_ONLY === 'true',
  /** Запасной путь YouTube через свой сервер (только если у сервера есть доступ к YouTube) */
  youtubeViaServer: import.meta.env.VITE_YOUTUBE_VIA_SERVER === 'true',
} as const;
