#!/usr/bin/env node
// scripts/theme-token-audit.mjs — аудит вёрстки темы на управляемые значения.
//
//   node scripts/theme-token-audit.mjs rose            # кандидаты literal → токен
//   node scripts/theme-token-audit.mjs rose --coverage # сколько var(--…) уже потребляется
//
// Находит в themes/<тема>/src/**/*.{astro,css} места, которыми управляют
// 10 разделов панели: цвета (#hex/rgb()/named tailwind), font-family,
// border-radius / rounded-*, и сводит в отчёт «файл:строка literal → кандидат».
// НЕ редактирует файлы — правки руками по themes/<тема>/tokens.map.md.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const theme = process.argv[2];
const coverage = process.argv.includes('--coverage');
if (!theme) { console.error('usage: theme-token-audit.mjs <theme> [--coverage]'); process.exit(2); }
const ROOT = path.resolve(import.meta.dirname, '..', 'themes', theme, 'src');
await fs.access(ROOT).catch(() => {
  console.error(`тема не найдена: themes/${theme}/src`);
  process.exit(1);
});

const CANDIDATES = [
  [/font-family:\s*([^;]+);/, 'font-family', '--font-heading | --font-body'],
  [/"(Comfortaa|Manrope|Playfair Display|Inter|Roboto|Montserrat[^"]*)"/, 'font literal', '--font-heading | --font-body'],
  [/#[0-9a-fA-F]{3,8}\b/, 'hex color', '--color-* (схемные)'],
  [/\brgb\(\s*\d+[^)]*\)/, 'rgb color', '--color-* (схемные)'],
  [/\b(?:bg|text|border)-(?:white|black|gray-\d+|neutral-\d+|zinc-\d+|stone-\d+)\b/, 'tailwind color', '--color-bg | --color-text | --color-border'],
  [/\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?/, 'radius', '--radius-button | --radius-card | --radius-media | --radius-input'],
  [/border-radius:\s*[^;]+;/, 'radius css', '--radius-*'],
];

async function* files(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(astro|css)$/.test(e.name)) yield p;
  }
}

let totalVar = 0, totalLiteral = 0;
for await (const file of files(ROOT)) {
  const src = await fs.readFile(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const lines = src.split('\n');
  if (coverage) {
    const n = (src.match(/var\(--/g) || []).length;
    totalVar += n;
    if (n) console.log(`${rel}: ${n} var(--…)`);
    continue;
  }
  lines.forEach((line, i) => {
    if (line.includes('var(--')) return; // уже мигрировано
    for (const [re, kind, suggest] of CANDIDATES) {
      const m = re.exec(line);
      if (m) {
        totalLiteral++;
        console.log(`${rel}:${i + 1} [${kind}] ${m[0].slice(0, 60)} → ${suggest}`);
        break;
      }
    }
  });
}
console.log(coverage ? `\nИтого var(--…): ${totalVar}` : `\nИтого кандидатов: ${totalLiteral}`);
