// Сквозная проверка в настоящем Chromium с загруженным расширением.
// Backend настоящий; yt-dlp и Groq — поддельные (доступа к YouTube/Groq из CI нет).
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'e2e', 'output');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LLM_PORT = 4010;
const BACKEND_PORT = 3000;
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'vnt-e2e-'));
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
};

// ---------- поддельный Groq (OpenAI-совместимый) ----------
const SUMMARY = {
  ideas: [
    'Переменная — имя, ссылающееся на значение; тип определяется автоматически',
    'Отступы — часть синтаксиса Python',
    'Хорошая функция делает одну вещь и имеет понятное имя',
  ],
  shortResume: 'Вводный урок по Python: переменные, типы данных, списки, условия, циклы и функции. Главная мысль — пишите понятный код, ведь его читают чаще, чем пишут.',
  timecodes: [
    { text: 'Переменные', timestamp: 3.5 },
    { text: 'Типы данных: int, float, str, bool', timestamp: 14 },
    { text: 'Списки и индексы с нуля', timestamp: 24.5 },
    { text: 'Условия и отступы', timestamp: 28 },
    { text: 'Циклы for и while', timestamp: 35 },
    { text: 'Функции', timestamp: 42 },
  ],
  furtherReading: [
    { title: 'Марк Лутц «Изучаем Python»', why: 'подробно про типы и функции' },
    { title: 'docs.python.org/3/tutorial', why: 'официальный учебник' },
  ],
  example: 'Функция, которая считает сумму списка:\n```python\ndef total(items):\n    return sum(items)\n\nprint(total([1, 2, 3]))  # 6\n```',
};
const INTERVIEW = {
  ideas: ['Интервью-версия конспекта.'],
  quotes: [{ text: 'Код читают чаще, чем пишут', timestamp: 49 }],
  conclusions: ['Пишите понятный код'],
  timecodes: SUMMARY.timecodes,
  shortResume: 'Беседа о Python',
};
const llmCalls = [];
const llm = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    llmCalls.push({ path: req.url, auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    // Как в октябре 2026: llama-3.3-70b-versatile отключена, gpt-oss-120b «недоступна» для этого ключа
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ object: 'list', data: ['whisper-large-v3', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'].map((id) => ({ id, object: 'model' })) }));
    if (req.url.endsWith('/chat/completions')) {
      const model = JSON.parse(body || '{}').model;
      llmCalls.push({ path: 'model', auth: model });
      if (model !== 'openai/gpt-oss-20b') {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: { message: `The model \`${model}\` does not exist or you do not have access to it.`, type: 'invalid_request_error', code: 'model_not_found' } }));
      }
      const isInterview = body.includes('ИНТЕРВЬЮ');
      return res.end(JSON.stringify({ id: 'c', object: 'chat.completion', created: 0, model: 'llama-3.3-70b-versatile', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(isInterview ? INTERVIEW : SUMMARY) } }] }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
});
await new Promise((r) => llm.listen(LLM_PORT, '127.0.0.1', r));

// ---------- тестовое видео ----------
const video = join(tmp, 'video.webm');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=60', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=60', '-c:v', 'libvpx', '-b:v', '400k', '-c:a', 'libopus', '-shortest', video]);
const audio = join(tmp, 'audio.mp3');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', audio]);

// ---------- backend ----------
const backend = spawn(process.execPath, [join(root, 'backend', 'dist', 'server.js')], {
  env: {
    ...process.env,
    PORT: String(BACKEND_PORT),
    LOG_LEVEL: 'warn',
    DATABASE_PATH: join(tmp, 'db.sqlite'),
    TMP_DIR: join(tmp, 'work'),
    YTDLP_PATH: join(root, 'backend', 'test', 'fixtures', 'fake-yt-dlp.mjs'),
    FAKE_VTT_FILE: join(root, 'e2e', 'fixtures', 'lesson.ru.vtt'),
    FAKE_TITLE: 'Основы Python за 10 минут',
    FAKE_DURATION: '60',
    FAKE_AUDIO_FILE: audio,
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; i < 50; i += 1) {
  try {
    if ((await fetch(`http://localhost:${BACKEND_PORT}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

// ---------- браузер с расширением ----------
const extPath = join(root, 'extension', 'dist-e2e');
if (!existsSync(join(extPath, 'manifest.json'))) throw new Error('Соберите e2e-версию: npm run build:e2e -w extension');
const context = await chromium.launchPersistentContext(join(tmp, 'profile'), {
  executablePath: CHROME,
  // chrome.downloads недоступен в headless — запускаем с экраном (xvfb-run в CI)
  headless: !process.env.DISPLAY,
  env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const watch = (page) => page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url().slice(0, 60)}: ${m.text()}`));

// ---------- поддельный YouTube: страница, данные плеера, панель «Расшифровка», субтитры ----------
const lessonLines = readFileSync(join(root, 'e2e', 'fixtures', 'lesson.ru.vtt'), 'utf8')
  .split('\n\n')
  .map((b) => b.split('\n'))
  .filter((l) => l[0]?.includes('-->'))
  .map((l, i) => ({ start: i * 3.5, text: i === 0 ? 'Привет из браузера! Сегодня разберём основы Python.' : l[1] }));
const ytCalls = [];
function playerResponse(id, withCaptions) {
  return {
    videoDetails: { videoId: id, title: id === 'capture0001' ? 'Видео с перехватом субтитров' : 'Основы Python за 10 минут', lengthSeconds: '60' },
    ...(withCaptions
      ? { captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: `https://www.youtube.com/api/timedtext?v=${id}&lang=ru`, languageCode: 'ru', name: { simpleText: 'Русский' } }] } } }
      : {}),
  };
}
function watchPage(id) {
  const withCaptions = !/^(nosubs|nocaps)/.test(id);
  const known = id === 'lesson0001' || id === 'capture0001' || /^(nosubs|nocaps)/.test(id);
  const data = withCaptions ? { engagementPanels: [{ x: { getTranscriptEndpoint: { params: `P_${id}` } } }] } : {};
  const title = id === 'capture0001' ? 'Видео с перехватом субтитров' : 'Основы Python за 10 минут';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} - YouTube</title>
<style>body{margin:0;background:#0f0f0f;color:#fff;font-family:Roboto,Arial,sans-serif}header{height:56px;display:flex;align-items:center;padding:0 24px;font-weight:bold;font-size:20px}
header span{color:#f00}main{padding:0 24px}video{width:820px;border-radius:12px;background:#000}h1{font-size:20px}.ytp-subtitles-button{margin:8px 0;padding:4px 10px}</style>
<script>var ytcfg={"INNERTUBE_API_KEY":"FAKEKEY","INNERTUBE_CLIENT_VERSION":"2.20260101.00.00"};</script>
${known ? `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse(id, withCaptions))};</script><script>var ytInitialData = ${JSON.stringify(data)};</script>` : ''}
</head><body><header><span>▶</span>&nbsp;YouTube</header><main><video controls autoplay muted loop></video>
<div><button class="ytp-subtitles-button" aria-pressed="false">CC</button></div><h1>${title}</h1><p style="color:#aaa">Канал «Код с нуля» · 120 тыс. просмотров</p></main>
<script>
fetch("/e2e-video.webm").then(r=>r.blob()).then(b=>{document.querySelector("video").src=URL.createObjectURL(b)});
// как настоящий плеер: при включении субтитров сам загружает их (с подписью pot)
document.querySelector('.ytp-subtitles-button').addEventListener('click', (e) => {
  const on = e.target.getAttribute('aria-pressed') !== 'true';
  e.target.setAttribute('aria-pressed', String(on));
  if (on) { const x = new XMLHttpRequest(); x.open('GET', '/api/timedtext?v=${id}&lang=ru&fmt=json3&pot=SIGNED'); x.send(); }
});
</script></body></html>`;
}
await context.route('https://www.youtube.com/**', async (route) => {
  const url = new URL(route.request().url());
  const id = url.searchParams.get('v') ?? '';
  if (url.pathname === '/e2e-video.webm') return route.fulfill({ status: 200, contentType: 'video/webm', body: readFileSync(video) });
  if (url.pathname === '/youtubei/v1/get_transcript') {
    const params = JSON.parse(route.request().postData() ?? '{}').params ?? '';
    ytCalls.push(`get_transcript ${params}`);
    if (params !== 'P_lesson0001') return route.fulfill({ status: 403, body: '{}' });
    const initialSegments = lessonLines.map((l) => ({ transcriptSegmentRenderer: { startMs: String(l.start * 1000), endMs: String(l.start * 1000 + 3400), snippet: { runs: [{ text: l.text }] } } }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [{ updateEngagementPanelAction: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: { body: { transcriptSegmentListRenderer: { initialSegments } } } } } } } }] }) });
  }
  if (url.pathname === '/api/timedtext') {
    ytCalls.push(`timedtext ${url.search}`);
    // без подписи pot YouTube отдаёт пустой ответ — как в реальности
    if (!url.searchParams.get('pot')) return route.fulfill({ status: 200, body: '' });
    const events = ['Перехвачено у плеера: первая фраза', 'вторая фраза про функции'].map((t, i) => ({ tStartMs: i * 4000, dDurationMs: 3500, segs: [{ utf8: t }] }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) });
  }
  return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: watchPage(id) });
});

let sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
// Перехватываем chrome.downloads.download в service worker, чтобы видеть запрошенное имя файла
await sw.evaluate(() => {
  const original = chrome.downloads.download.bind(chrome.downloads);
  globalThis.__downloads = [];
  chrome.downloads.download = (options) => {
    const entry = { name: options.filename, id: null };
    globalThis.__downloads.push(entry);
    return original(options).then((id) => ((entry.id = id), id));
  };
});
async function nextDownload(trigger) {
  const worker = context.serviceWorkers()[0];
  const before = await worker.evaluate(() => globalThis.__downloads.length);
  await trigger();
  for (let i = 0; i < 100; i += 1) {
    const item = await worker.evaluate(async (n) => {
      const entry = globalThis.__downloads[n];
      if (!entry || entry.id === null) return null;
      const [item] = await chrome.downloads.search({ id: entry.id });
      return item?.state === 'complete' ? { path: item.filename, name: entry.name } : null;
    }, before);
    if (item) return item;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('download did not complete');
}
const extId = new URL(sw.url()).host;
check('расширение загружено', Boolean(extId), extId);

// 1. Настройки (открываются сами при установке)
await new Promise((r) => setTimeout(r, 1000));
let settings = context.pages().find((p) => p.url().includes('settings'));
check('при установке открылись настройки', Boolean(settings));
settings ??= await context.newPage();
watch(settings);
await settings.goto(`chrome-extension://${extId}/src/ui/settings/index.html`);
await settings.setViewportSize({ width: 900, height: 1300 });
await settings.getByText('Текущий: ').first().waitFor();
await settings.screenshot({ path: join(out, '1-settings.png'), fullPage: true });
await settings.getByRole('button', { name: 'Проверить' }).click();
await settings.getByText('Сервер работает').waitFor({ timeout: 10000 });
check('настройки: проверка сервера', true);
await settings.getByPlaceholder('gsk_...').fill('gsk_e2e_test_key');
await settings.getByRole('button', { name: 'Сохранить' }).click();
await settings.getByText('Настройки сохранены ✅').waitFor({ timeout: 10000 });
check('настройки: ключ Groq проверен и сохранён', llmCalls.some((c) => c.path.endsWith('/models') && c.auth === 'Bearer gsk_e2e_test_key'));
await settings.screenshot({ path: join(out, '2-settings-saved.png'), fullPage: true });

// Неверный формат адреса сервера → ошибка
await settings.locator('input.font-mono').last().fill('localhost:3000');
await settings.getByRole('button', { name: 'Сохранить' }).click();
await settings.getByText('должен начинаться с http').waitFor();
check('настройки: валидация адреса сервера', true);
await settings.getByRole('button', { name: 'Отмена' }).click();

// 2. Страница видео → sidebar → конспект
const page = await context.newPage();
watch(page);
await page.goto('https://www.youtube.com/watch?v=lesson0001');
await page.bringToFront();
await page.locator('video').evaluate((v) => new Promise((r) => (v.readyState >= 2 ? r() : v.addEventListener('loadeddata', r, { once: true }))));
const launcher = page.locator('#videonote-taker-root .launcher');
await launcher.waitFor({ state: 'visible', timeout: 10000 });
check('кнопка расширения на странице видео', true);
await launcher.click();
const sidebar = page.frameLocator('#videonote-taker-root iframe.panel');
await sidebar.getByRole('button', { name: /Создать конспект/ }).first().click();
await sidebar.getByText('Помощь от ИИ: что почитать по теме', { exact: true }).waitFor({ timeout: 30000 });
check('конспект создан (субтитры YouTube из браузера + Groq)', ytCalls.includes('get_transcript P_lesson0001'), ytCalls.join(' | '));
const triedModels = llmCalls.filter((c) => c.path === 'model').map((c) => c.auth);
check('отключённая модель Groq → автоматически выбрана доступная', triedModels[0] === 'openai/gpt-oss-120b' && triedModels.includes('openai/gpt-oss-20b'), [...new Set(triedModels)].join(' → '));
await page.screenshot({ path: join(out, '3-sidebar-summary.png') });

// Клик по таймкоду перематывает видео
await sidebar.getByRole('link', { name: '00:42' }).first().click();
await page.waitForTimeout(400);
const t = await page.locator('video').evaluate((v) => v.currentTime);
check('клик по таймкоду перематывает видео', t >= 41 && t < 46, `currentTime=${t.toFixed(1)}`);

// Скриншот кадра кнопкой 📷 и «горячей клавишей» (команда из background)
await sidebar.getByTitle('Скриншот кадра (Ctrl+Shift+S)').click();
await sidebar.getByAltText(/Скриншот \d\d:\d\d/).first().waitFor({ timeout: 10000 });
check('скриншот кадра по кнопке', true);
sw = context.serviceWorkers()[0];
await sw.evaluate(async () => {
  // Как в обработчике chrome.commands: активная вкладка
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'take-screenshot' });
});
await page.waitForTimeout(1500);
const shots = await sidebar.getByAltText(/Скриншот \d\d:\d\d/).count();
check('скриншот по команде Ctrl+Shift+S (обработчик content script)', shots === 2, `${shots} шт.`);
await sidebar.getByPlaceholder('Комментарий…').first().fill('Схема переменных');
await sidebar.getByPlaceholder('Комментарий…').first().blur();
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, '4-sidebar-screenshots.png') });

await sidebar.getByRole('tab', { name: /Транскрипт/ }).click();
await sidebar.getByText('Начнём с переменных').waitFor();
check('транскрипт получен через браузер (панель «Расшифровка»)', await sidebar.getByText('Привет из браузера!').count() > 0);
await page.screenshot({ path: join(out, '5-sidebar-transcript.png') });

// Экспорт в Word и Markdown
const { path: docxPath, name: docxName } = await nextDownload(() => sidebar.getByRole('button', { name: 'Word' }).click());
const zip = await JSZip.loadAsync(readFileSync(docxPath));
const xml = await zip.file('word/document.xml').async('string');
const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !zip.files[f].dir).length;
check('экспорт Word: разделы обучающего видео, скриншоты, без транскрипта', xml.includes('Основы Python') && xml.includes('Помощь от ИИ: пример') && !xml.includes('Начнём с переменных') && media === 2 && docxName === 'Основы Python за 10 минут.docx', `${docxName}, картинок: ${media}`);
copyFileSync(docxPath, join(out, 'example.docx'));
const { path: mdPath, name: mdName } = await nextDownload(() => sidebar.getByRole('button', { name: 'Markdown' }).click());
const md = readFileSync(mdPath, 'utf8');
check('экспорт Markdown со ссылками на таймкоды', mdName.endsWith('.md') && md.includes('](https://www.youtube.com/watch?v=lesson0001&t=42s)') && md.includes('Схема переменных'), mdName);
copyFileSync(mdPath, join(out, 'example.md'));

// Пересоздать конспект как «Интервью»
await sidebar.getByRole('tab', { name: 'Конспект' }).click();
await sidebar.getByLabel('Тип видео для пересоздания').selectOption('interview');
await sidebar.getByRole('button', { name: /Пересоздать/ }).click();
await sidebar.getByText('Интервью-версия конспекта.').waitFor({ timeout: 15000 });
check('пересоздание как «Интервью»: идеи, цитаты, выводы, таймкоды', (await sidebar.getByText('Выводы', { exact: true }).count()) === 1 && (await sidebar.getByText('Главные цитаты', { exact: true }).count()) === 1);
await page.screenshot({ path: join(out, '3b-sidebar-interview.png') });

// Real-time без Whisper → понятное объяснение
await sidebar.getByRole('button', { name: /Запись в реальном времени/ }).click();
await sidebar.getByText(/Для записи в реальном времени нужен Whisper/).waitFor({ timeout: 10000 });
check('real-time без ключа OpenAI → понятная подсказка', true);

// Видео, где работают только субтитры самого плеера (как при защите pot)
const capturePage = await context.newPage();
watch(capturePage);
await capturePage.goto('https://www.youtube.com/watch?v=capture0001');
await capturePage.bringToFront();
await capturePage.locator('#videonote-taker-root .launcher').click();
const captureSidebar = capturePage.frameLocator('#videonote-taker-root iframe.panel');
await captureSidebar.getByRole('button', { name: /Создать конспект/ }).first().click();
await captureSidebar.getByText('Таймкоды', { exact: true }).waitFor({ timeout: 30000 });
await captureSidebar.getByRole('tab', { name: /Транскрипт/ }).click();
await captureSidebar.getByText('Перехвачено у плеера: первая фраза').waitFor({ timeout: 10000 });
const ccState = await capturePage.locator('.ytp-subtitles-button').getAttribute('aria-pressed');
check('субтитры перехвачены у плеера, кнопка CC вернулась в исходное состояние', ccState === 'false', `aria-pressed=${ccState}`);
await capturePage.close();

// 3. Popup: видео без субтитров, история
const popup = await context.newPage();
watch(popup);
await popup.setViewportSize({ width: 400, height: 590 });
await popup.goto(`chrome-extension://${extId}/src/ui/popup/index.html`);
await popup.getByPlaceholder(/Ссылка на YouTube/).fill('https://www.youtube.com/watch?v=nosubs0001');
await popup.getByText('✓ YouTube').waitFor();
await popup.getByRole('button', { name: /Создать конспект/ }).click();
await popup.getByText(/нет автосубтитров/).waitFor({ timeout: 15000 });
check('popup: видео без субтитров → подсказка добавить ключ', true);
await popup.screenshot({ path: join(out, '6-popup-no-subtitles.png') });

await popup.getByPlaceholder(/Ссылка на YouTube/).fill('https://rutube.ru/video/c6cc4d620b1d4338901770a44b3e82f4/');
await popup.getByText('✓ Rutube').waitFor();
check('popup: автоопределение платформы Rutube', true);
await popup.getByPlaceholder(/Ссылка на YouTube/).fill('https://www.youtube.com/watch?v=private0001');
await popup.getByRole('button', { name: /Создать конспект/ }).click();
await popup.getByText(/приватное/).waitFor({ timeout: 15000 });
check('popup: приватное видео → понятная ошибка', true);

await popup.getByPlaceholder(/Ссылка на YouTube/).fill('https://youtu.be/lesson0001');
await popup.getByText('Основы Python за 10 минут').first().waitFor();
await popup.screenshot({ path: join(out, '7-popup-note.png') });
check('popup: показывает готовый конспект по ссылке', true);
const { name: popupDocx } = await nextDownload(() => popup.getByRole('button', { name: 'Word' }).click());
check('popup: экспорт Word с правильным именем файла', popupDocx === 'Основы Python за 10 минут.docx', popupDocx);

await popup.getByRole('tab', { name: /История/ }).click();
await popup.getByText('Основы Python за 10 минут').first().waitFor();
await popup.screenshot({ path: join(out, '8-popup-history.png') });
await popup.getByPlaceholder('Поиск по названию и конспекту').fill('нет такого');
await popup.getByText('Ничего не найдено').waitFor();
check('popup: история с поиском', true);

// 4. Гайды открываются
const [guide] = await Promise.all([context.waitForEvent('page'), settings.getByRole('button', { name: /Как получить ключ Groq/ }).click()]);
await guide.waitForLoadState();
check('кнопка «Как получить ключ» открывает PDF', guide.url().endsWith('/guides/groq-guide.pdf'), guide.url());

const relevantErrors = errors.filter((e) => !e.includes('favicon') && !/net::ERR|Failed to load resource/.test(e));
check('нет ошибок в консоли расширения', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));

await context.close();
backend.kill();
llm.close();
rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} проверок прошло`);
process.exit(failed ? 1 : 0);
