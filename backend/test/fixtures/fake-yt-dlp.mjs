#!/usr/bin/env node
// Поддельный yt-dlp для тестов: ведёт себя как настоящий на нужных нам флагах.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const url = args[args.length - 1] ?? '';
const id = url.match(/v=([\w-]+)/)?.[1] ?? 'unknown';
const arg = (name) => args[args.indexOf(name) + 1];

if (args.includes('--help')) {
  console.log('  --js-runtimes RUNTIME[:PATH]  Additional JavaScript runtime');
  process.exit(0);
}
if (args.includes('--version')) {
  console.log('2099.01.01');
  process.exit(0);
}
if (id.startsWith('private')) {
  console.error(`ERROR: [youtube] ${id}: Private video. Sign in if you've been granted access to this video`);
  process.exit(1);
}
if (id.startsWith('netfail')) {
  console.error(`ERROR: [youtube] ${id}: Unable to download API page: ('Connection aborted.', ConnectionResetError(10054, 'Удаленный хост принудительно разорвал существующее подключение', None, 10054, None))`);
  process.exit(1);
}
if (id.startsWith('removed')) {
  console.error(`ERROR: [youtube] ${id}: Video unavailable. This video has been removed by the uploader`);
  process.exit(1);
}
if (args.includes('--dump-single-json')) {
  const hasSubs = !id.startsWith('nosubs');
  console.log(
    JSON.stringify({
      id,
      title: process.env.FAKE_TITLE ?? `Тестовое видео ${id}`,
      duration: Number(process.env.FAKE_DURATION ?? 10),
      language: 'ru',
      subtitles: {},
      automatic_captions: hasSubs ? { 'ru-orig': [{ ext: 'vtt' }], ru: [{ ext: 'vtt' }], en: [{ ext: 'vtt' }] } : {},
    }),
  );
  process.exit(0);
}
if (args.includes('--write-auto-subs') || args.includes('--write-subs')) {
  const template = arg('-o');
  const lang = arg('--sub-langs');
  writeFileSync(template.replace('%(ext)s', `${lang}.vtt`), readFileSync(process.env.FAKE_VTT_FILE ?? join(here, 'youtube-auto.ru.vtt'), 'utf8'));
  process.exit(0);
}
if (args.includes('-x')) {
  const template = arg('-o');
  copyFileSync(process.env.FAKE_AUDIO_FILE, template.replace('%(ext)s', 'mp3'));
  process.exit(0);
}
console.error(`ERROR: unexpected args ${args.join(' ')}`);
process.exit(2);
