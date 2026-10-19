// Генерация PDF-инструкций в public/guides/ через headless Chrome/Chromium.
// Запуск: npm run guides  (путь к браузеру можно задать в CHROME_PATH)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guides } from './guides-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'guides');
const icon = readFileSync(join(root, 'public', 'icons', 'icon-128.png')).toString('base64');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('Chrome/Chromium не найден. Укажите путь: CHROME_PATH=/path/to/chrome npm run guides');
  process.exit(1);
}

const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DejaVu Sans', 'Segoe UI', Arial, sans-serif, 'Noto Color Emoji'; color: #0f172a; font-size: 11.5pt; line-height: 1.42; }
.hero { background: linear-gradient(135deg, #f43f5e, #f97316); color: #fff; padding: 26px 40px 22px; display: flex; gap: 22px; align-items: center; }
.hero img { width: 66px; height: 66px; border-radius: 18px; box-shadow: 0 6px 18px rgba(0,0,0,.18); background: #fff; }
.hero h1 { margin: 0; font-size: 21pt; line-height: 1.2; }
.badge { display: inline-block; margin-top: 8px; padding: 3px 12px; border-radius: 999px; background: rgba(255,255,255,.22); font-size: 10.5pt; font-weight: bold; }
main { padding: 18px 40px 12px; }
.intro { color: #334155; margin: 0 0 12px; }
.callout { border: 2px solid #fdba74; background: #fff7ed; border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; font-weight: bold; color: #9a3412; }
.step { display: flex; gap: 14px; margin-bottom: 10px; page-break-inside: avoid; }
.num { flex: none; width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, #f43f5e, #f97316); color: #fff; font-weight: bold; font-size: 15pt; display: flex; align-items: center; justify-content: center; }
.card { flex: 1; border: 1px solid #e2e8f0; border-radius: 14px; padding: 9px 14px; }
.card h2 { margin: 0 0 4px; font-size: 13pt; }
ul { margin: 0; padding-left: 20px; } li { margin: 2px 0; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 10.5pt; background: #f1f5f9; border-radius: 5px; padding: 1px 5px; }
a { color: #c2410c; }
.warning { margin-top: 8px; background: #fef2f2; border-left: 4px solid #ef4444; padding: 7px 10px; border-radius: 6px; color: #991b1b; font-weight: bold; font-size: 11pt; }
.note { margin-top: 8px; background: #f8fafc; border-left: 4px solid #94a3b8; padding: 7px 10px; border-radius: 6px; font-size: 11pt; }
.note b { display: block; margin-bottom: 2px; }
.facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; page-break-inside: avoid; }
.fact { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; font-size: 10.5pt; }
.fact .e { font-size: 18pt; } .fact b { display: block; margin: 2px 0; font-size: 11pt; }
footer { padding: 0 40px; color: #94a3b8; font-size: 9.5pt; }
`;

const esc = (s) => s; // содержимое — доверенный HTML из guides-content.mjs

function render(g) {
  const steps = g.steps
    .map(
      (s, i) => `<section class="step"><div class="num">${i + 1}</div><div class="card"><h2>Шаг ${i + 1}. ${s.title}</h2>
<ul>${s.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>
${s.warning ? `<div class="warning">⚠️ ${s.warning}</div>` : ''}
${s.note ? `<div class="note"><b>${s.note.title}</b><ul>${s.note.items.map((it) => `<li>${it}</li>`).join('')}</ul></div>` : ''}
</div></section>`,
    )
    .join('');
  const facts = g.facts.map(([e, t, v]) => `<div class="fact"><div class="e">${e}</div><b>${t}</b>${v}</div>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${g.title}</title><style>${css}${g.zoom ? `body { zoom: ${g.zoom}; }` : ''}</style></head><body>
<div class="hero"><img src="data:image/png;base64,${icon}" alt=""><div><h1>📘 ${g.title.replace('API-', 'API\u2011')}</h1><span class="badge">${g.badge}</span></div></div>
<main><p class="intro">${g.intro}</p>${g.callout ? `<div class="callout">⚠️ ${g.callout}</div>` : ''}${steps}<div class="facts">${facts}</div></main>
<footer>VideoNote Taker · Конспекты видео с таймкодами</footer></body></html>`;
}

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'vnt-guides-'));
try {
  for (const g of guides) {
    const html = join(tmp, g.file.replace('.pdf', '.html'));
    writeFileSync(html, render(g));
    const out = join(outDir, g.file);
    const res = spawnSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`, `file://${html}`], { encoding: 'utf8' });
    if (res.status !== 0 || !existsSync(out)) {
      console.error(res.stderr);
      process.exit(1);
    }
    console.log(`✓ ${out}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
