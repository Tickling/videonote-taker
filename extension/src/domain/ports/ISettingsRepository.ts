import type { UserSettings } from '../valueObjects/UserSettings';

export interface ISettingsRepository {
  get(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
}
