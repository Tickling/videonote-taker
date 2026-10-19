// Сборка готового к раздаче архива release/VideoNote-Taker.zip:
// extension/ (собранное расширение), server/ (собранный backend), скрипты запуска.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zip = new JSZip();
const top = zip.folder('VideoNote-Taker');

function addDir(src, dest, filter = () => true) {
  for (const name of readdirSync(src)) {
    const path = join(src, name);
    if (!filter(path)) continue;
    if (statSync(path).isDirectory()) addDir(path, dest.folder(name), filter);
    else dest.file(name, readFileSync(path), { unixPermissions: statSync(path).mode });
  }
}

// --store: только пакет для Chrome Web Store (manifest.json в корне архива)
if (process.argv.includes('--store')) {
  const dist = join(root, 'extension', 'dist-store');
  if (!existsSync(join(dist, 'manifest.json'))) throw new Error('Нет extension/dist-store — выполните npm run build:store -w extension');
  const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
  const store = new JSZip();
  addDir(dist, store);
  mkdirSync(join(root, 'release'), { recursive: true });
  const out = join(root, 'release', `VideoNote-Taker-ChromeWebStore-${version}.zip`);
  writeFileSync(out, await store.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(`✓ ${relative(root, out)} (${(statSync(out).size / 1024 / 1024).toFixed(1)} МБ)`);
  process.exit(0);
}

for (const required of ['extension/dist/manifest.json', 'backend/dist/server.js']) {
  if (!existsSync(join(root, required))) throw new Error(`Нет ${required} — сначала выполните npm run build`);
}

addDir(join(root, 'extension', 'dist'), top.folder('extension'));

const backendPkg = JSON.parse(readFileSync(join(root, 'backend', 'package.json'), 'utf8'));
const server = top.folder('server');
server.file(
  'package.json',
  JSON.stringify(
    { name: 'videonote-taker-server', private: true, version: backendPkg.version, type: 'module', engines: backendPkg.engines, scripts: { start: 'node --env-file=.env dist/server.js' }, dependencies: backendPkg.dependencies },
    null,
    2,
  ),
);
server.file('.env.example', readFileSync(join(root, 'backend', '.env.example')));
addDir(join(root, 'backend', 'dist'), server.folder('dist'), (p) => !p.endsWith('.map'));

for (const name of readdirSync(join(root, 'release-template'))) {
  const path = join(root, 'release-template', name);
  top.file(name, readFileSync(path), { unixPermissions: statSync(path).mode });
}

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', 'VideoNote-Taker.zip');
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' }));
console.log(`✓ ${relative(root, out)} (${(statSync(out).size / 1024 / 1024).toFixed(1)} МБ)`);
