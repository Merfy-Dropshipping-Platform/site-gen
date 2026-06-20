#!/usr/bin/env node
/**
 * CSS-layer guard + codemod для theme global.css.
 *
 * ПРОБЛЕМА (2026-06-20): ручной normalize/preflight в themes/<t>/src/styles/global.css лежал
 * БЕЗ @layer. В каскаде CSS unlayered-правило побеждает ЛЮБОЙ @layer — поэтому element-reset
 * `img{height:auto;max-width:100%}` бил утилиту лого `.h-[var(--size-logo-width)]`/`.max-w-[160px]`
 * (они в @layer utilities) → лого рендерился в натуральную величину на live (но не в превью).
 * `@import "tailwindcss"` УЖЕ даёт этот reset в @layer base (где утилиты перекрывают).
 *
 * РЕШЕНИЕ: element/attr-resets темы обязаны быть в @layer (base), а не unlayered. Тогда
 * @layer utilities всегда выигрывает у base → утилиты (размер лого и т.д.) применяются.
 * Компонентные КЛАССЫ (.account-*, .auth-*, .font-*) — допускаются unlayered (они не
 * перебивают утилиты неожиданно: класс vs класс решает порядок/специфичность, и в разметке
 * их обычно не комбинируют с конфликтующей утилитой).
 *
 *   node scripts/check-css-layers.mjs --check  # build/CI guard: упасть на unlayered element/attr-resets
 *   node scripts/check-css-layers.mjs --fix     # codemod: обернуть их в @layer base
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'themes/rose/src/styles/global.css',
  'themes/bloom/src/styles/global.css',
  'themes/flux/src/styles/global.css',
  'themes/satin/src/styles/global.css',
  'themes/vanilla/src/styles/global.css',
  'packages/theme-base/styles/global.css',
  'packages/theme-base/styles/base.css',
];

/** Top-level сегменты с учётом строк/комментариев (чтобы @source "..{a,b}" не ломал скобки). */
function segments(css) {
  const segs = [];
  let depth = 0, start = 0, i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (ch === '"' || ch === "'") { const q = ch; i++; while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { segs.push(css.slice(start, i + 1)); start = i + 1; } }
    else if (ch === ';' && depth === 0) { segs.push(css.slice(start, i + 1)); start = i + 1; }
    i++;
  }
  if (start < css.length && css.slice(start).trim()) segs.push(css.slice(start));
  return segs;
}

/** Селектор-лист содержит «голый» элемент/универсал/атрибут/псевдо (preflight-style)? */
function hasElementSelector(prelude) {
  return prelude.split(',').some((part) => {
    const p = part.trim();
    if (!p || p.startsWith('.') || p.startsWith('#') || /^:root\b/.test(p)) return false;
    return /^[a-zA-Z*]/.test(p) || p.startsWith('[') || p.startsWith(':') || p.startsWith('::');
  });
}

function classify(seg) {
  const s = seg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").trim();
  if (!s) return 'blank';
  const hasBlock = s.includes('{');
  const prelude = s.split('{')[0].trim().replace(/\s+/g, ' ');
  if (prelude.startsWith('@')) return 'keep'; // @import/@source/@theme/@layer/@font-face/@keyframes/@media/...
  if (!hasBlock) return 'keep';
  if (/^:root\b/.test(prelude)) return 'keep';
  return hasElementSelector(prelude) ? 'wrap' : 'keep'; // element/attr-reset → @layer base; класс → ок
}

function offenders(css) {
  return segments(css).filter((s) => classify(s) === 'wrap')
    .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('{')[0].trim().replace(/\s+/g, ' ').slice(0, 60));
}

function fix(css) {
  // Оборачиваем БЕЗ переотступа внутренних строк (CSS пробелы не важны) — diff = только
  // строки `@layer base {` / `}` вокруг каждого пробега element/attr-правил.
  let out = '', buf = [];
  const flush = () => { if (buf.length) { out += '\n@layer base {' + buf.join('') + '\n}\n'; buf = []; } };
  for (const seg of segments(css)) {
    if (classify(seg) === 'wrap') buf.push(seg);
    else { flush(); out += seg; }
  }
  flush();
  return out;
}

const mode = process.argv.includes('--fix') ? 'fix' : 'check';
const fromHead = process.argv.includes('--from-head'); // источник = последний коммит (чистый diff)
let failed = false;
for (const rel of FILES) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) continue;
  const css = fromHead
    ? execSync(`git show HEAD:${rel}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 10485760 })
    : readFileSync(abs, 'utf8');
  const off = offenders(css);
  if (mode === 'fix') {
    if (off.length) { writeFileSync(abs, fix(css)); console.log(`[fix] ${rel}: обёрнуто ${off.length} element/attr-правил в @layer base`); }
    else console.log(`[fix] ${rel}: чисто`);
  } else if (off.length) {
    failed = true;
    console.error(`\n✗ ${rel}: ${off.length} UNLAYERED element/attr-правил (→ в @layer base):`);
    off.slice(0, 10).forEach((s) => console.error(`    ${s}`));
    if (off.length > 10) console.error(`    … ещё ${off.length - 10}`);
  } else console.log(`✓ ${rel}`);
}
if (mode === 'check' && failed) {
  console.error('\nUnlayered element/attr CSS бьёт @layer utilities (баг «лого на всю высоту»). `node scripts/check-css-layers.mjs --fix`.');
  process.exit(1);
}
console.log(mode === 'fix' ? '\n[fix] готово — проверь git diff' : '\n✓ element/attr-resets во всех global.css слоёные');
