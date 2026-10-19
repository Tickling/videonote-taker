import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VideoNote } from '@domain/entities/VideoNote';
import { DEFAULT_SETTINGS, type UserSettings } from '@domain/valueObjects/UserSettings';
import { createUiContainer, type UiContainer } from '@infrastructure/container';
import {
  noteKey,
  realtimeKey,
  STORAGE_KEYS,
  taskKey,
  type RealtimeState,
  type TaskState,
} from '@infrastructure/messaging/messages';

let containerSingleton: UiContainer | null = null;
export function useContainer(): UiContainer {
  containerSingleton ??= createUiContainer('ui');
  return containerSingleton;
}

/** Подписка на изменения ключей chrome.storage.local. */
function useStorageListener(match: (key: string) => boolean, onChange: () => void): void {
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
      if (area === 'local' && Object.keys(changes).some(match)) onChange();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [match, onChange]);
}

export function useSettings(): { settings: UserSettings; loaded: boolean; reload: () => void } {
  const { settings: repo } = useContainer();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    void repo.get().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, [repo]);
  useEffect(reload, [reload]);
  useStorageListener(useCallback((k) => k === STORAGE_KEYS.settings, []), reload);
  return { settings, loaded, reload };
}

export function useNote(noteId: string | null): { note: VideoNote | null; loaded: boolean } {
  const { notes } = useContainer();
  const [note, setNote] = useState<VideoNote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    if (!noteId) {
      setNote(null);
      setLoaded(true);
      return;
    }
    void notes.findById(noteId).then((n) => {
      setNote(n);
      setLoaded(true);
    });
  }, [noteId, notes]);
  useEffect(load, [load]);
  const key = noteId ? noteKey(noteId) : '';
  useStorageListener(useCallback((k) => k === key, [key]), load);
  return { note, loaded };
}

const STALE_TASK_MS = 3 * 60 * 1000;

export function useTask(noteId: string | null): TaskState | null {
  const [task, setTask] = useState<TaskState | null>(null);
  const key = noteId ? taskKey(noteId) : '';
  const load = useCallback(() => {
    if (!key) {
      setTask(null);
      return;
    }
    void chrome.storage.local.get(key).then((data) => {
      const value = data[key] as TaskState | undefined;
      // Задача, которая давно не обновлялась, — прервана (перезапуск браузера)
      if (value?.status === 'running' && Date.now() - value.updatedAt > STALE_TASK_MS) {
        setTask({ ...value, status: 'failed', error: { code: 'INTERRUPTED', message: 'Обработка была прервана. Нажмите «Повторить».' } });
      } else setTask(value ?? null);
    });
  }, [key]);
  useEffect(load, [load]);
  useStorageListener(useCallback((k) => k === key, [key]), load);
  return task;
}

export function useRealtime(tabId: number | null): RealtimeState | null {
  const [state, setState] = useState<RealtimeState | null>(null);
  const key = tabId !== null && tabId >= 0 ? realtimeKey(tabId) : '';
  const load = useCallback(() => {
    if (!key) return;
    void chrome.storage.local.get(key).then((data) => setState((data[key] as RealtimeState | undefined) ?? null));
  }, [key]);
  useEffect(load, [load]);
  useStorageListener(useCallback((k) => k === key, [key]), load);
  return state;
}

export function useNotesList(): { notes: VideoNote[]; reload: () => void } {
  const { listNotes } = useContainer();
  const [list, setList] = useState<VideoNote[]>([]);
  const reload = useCallback(() => {
    void listNotes.execute().then(setList);
  }, [listNotes]);
  useEffect(reload, [reload]);
  useStorageListener(useCallback((k) => k.startsWith(STORAGE_KEYS.notePrefix), []), reload);
  return useMemo(() => ({ notes: list, reload }), [list, reload]);
}
