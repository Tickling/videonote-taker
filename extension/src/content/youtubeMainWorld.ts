// Выполняется в контексте страницы YouTube (world: MAIN): ловит субтитры, которые загружает сам плеер,
// и передаёт их content script расширения. Плеер подписывает такие запросы сам — их YouTube не блокирует.
export {};

const SOURCE = 'vnt-main';
const FLAG = '__videonoteTimedtextHook';
const already = (window as unknown as Record<string, unknown>)[FLAG] === true;
(window as unknown as Record<string, unknown>)[FLAG] = true;

function report(url: string, body: string): void {
  if (!body) return;
  window.postMessage({ source: SOURCE, type: 'timedtext', url, body }, window.location.origin);
}

function isTimedText(url: string): boolean {
  return url.includes('/api/timedtext');
}

const originalFetch = window.fetch;
if (!already) window.fetch = async function patchedFetch(this: typeof window, ...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await originalFetch.apply(this, args);
  try {
    const input = args[0];
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isTimedText(url) && response.ok) {
      void response
        .clone()
        .text()
        .then((body) => report(url, body))
        .catch(() => undefined);
    }
  } catch {
    // перехват не должен ломать страницу
  }
  return response;
};

const originalOpen = XMLHttpRequest.prototype.open;
if (!already) XMLHttpRequest.prototype.open = function patchedOpen(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]): void {
  const href = typeof url === 'string' ? url : url.href;
  if (isTimedText(href)) {
    this.addEventListener('load', () => {
      try {
        if (this.status !== 200) return;
        if (this.responseType === '' || this.responseType === 'text') report(href, this.responseText);
        else if (this.responseType === 'json') report(href, JSON.stringify(this.response));
        else if (this.responseType === 'arraybuffer' && this.response instanceof ArrayBuffer) report(href, new TextDecoder().decode(this.response));
      } catch {
        // ignore
      }
    });
  }
  // @ts-expect-error — пробрасываем оригинальные необязательные аргументы (async, user, password)
  return originalOpen.call(this, method, url, ...rest);
};
