// Картинки для Chrome Web Store из скриншотов e2e (сначала: npm run e2e).
// Результат: store/screenshots/*.png (1280×800) и store/promo-440x280.png.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'e2e', 'output');
const outDir = join(root, 'store', 'screenshots');
mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const img = (name) => {
  const path = join(shots, name);
  if (!existsSync(path)) throw new Error(`Нет ${path} — запустите npm run e2e`);
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
};
const icon = `data:image/png;base64,${readFileSync(join(root, 'extension', 'public', 'icons', 'icon-128.png')).toString('base64')}`;

const css = `*{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:'DejaVu Sans',Arial,sans-serif,'Noto Color Emoji';
background:linear-gradient(135deg,#fff7ed 0%,#ffe4e6 100%);color:#0f172a}
.head{height:120px;display:flex;align-items:center;gap:20px;padding:0 56px}.head img{width:56px;height:56px;border-radius:14px}
h1{margin:0;font-size:38px;line-height:1.15}h1 span{color:#ea580c}p{margin:6px 0 0;font-size:20px;color:#475569}
.stage{position:absolute;left:56px;right:56px;top:128px;bottom:28px;display:flex;gap:28px;justify-content:center;align-items:flex-start}
.frame{border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,.25);background:#fff}
.frame img{display:block;width:100%}`;

const slides = [
  { file: '1-summary.png', title: 'Конспект <span>рядом с видео</span>', sub: 'Идеи, суть и таймкоды — клик по таймкоду перематывает видео', images: [['3-sidebar-summary.png', 1060]] },
  { file: '2-types.png', title: 'Свой конспект для <span>каждого типа видео</span>', sub: 'Интервью: идеи, цитаты, выводы · Урок: мысли и советы ИИ · Фильм: герои и оценка', images: [['3b-sidebar-interview.png', 1060]] },
  { file: '3-screenshots.png', title: 'Скриншоты кадров <span>с таймкодами</span>', sub: 'Ctrl+Shift+S — кадр сохраняется в конспект, можно добавить комментарий', images: [['4-sidebar-screenshots.png', 1060]] },
  { file: '4-popup.png', title: 'Конспект <span>по ссылке</span> и история', sub: 'YouTube, Rutube и VK Видео · экспорт в Word и Markdown', images: [['7-popup-note.png', 400], ['8-popup-history.png', 400]] },
  { file: '5-free.png', title: '<span>Бесплатно</span>: нужен только ключ Groq', sub: 'Ключи хранятся только в вашем браузере · по желанию — OpenAI Whisper и GPT-4o', images: [['2-settings-saved.png', 760]] },
];

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const slide of slides) {
  const frames = slide.images.map(([name, width]) => `<div class="frame" style="width:${width}px"><img src="${img(name)}"></div>`).join('');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="head"><img src="${icon}"><div><h1>${slide.title}</h1><p>${slide.sub}</p></div></div><div class="stage">${frames}</div></body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, slide.file) });
  console.log(`✓ store/screenshots/${slide.file}`);
}

await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:440px;height:280px;overflow:hidden;font-family:'DejaVu Sans',Arial,sans-serif;background:linear-gradient(135deg,#f43f5e,#f97316);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 32px;box-sizing:border-box}
img{width:72px;height:72px;border-radius:18px;box-shadow:0 8px 20px rgba(0,0,0,.2);background:#fff}h1{margin:14px 0 6px;font-size:32px}p{margin:0;font-size:17px;line-height:1.35;opacity:.95}
</style></head><body><img src="${icon}"><h1>VideoNote Taker</h1><p>Конспект любого видео с таймкодами — бесплатно, в один клик</p></body></html>`);
await page.screenshot({ path: join(root, 'store', 'promo-440x280.png') });
console.log('✓ store/promo-440x280.png');
await browser.close();
