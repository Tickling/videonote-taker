/**
 * Подключает content scripts к уже открытой вкладке. Нужно после установки/обновления
 * расширения: Chrome не внедряет их в вкладки, открытые раньше (до F5 расширение там «молчит»).
 */
export async function injectContentScripts(tabId: number): Promise<void> {
  const scripts = chrome.runtime.getManifest().content_scripts ?? [];
  for (const script of scripts) {
    if (!script.js?.length) continue;
    const world = (script as { world?: string }).world === 'MAIN' ? 'MAIN' : 'ISOLATED';
    await chrome.scripting.executeScript({ target: { tabId }, files: script.js, world });
  }
}
