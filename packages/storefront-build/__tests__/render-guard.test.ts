import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RENDER_GUARD_RULES, readShopSources, renderGuardProblems } from '../src/render-guard';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const NEW_THEMES = readdirSync(join(ROOT, 'themes')).filter((id) =>
  existsSync(join(ROOT, 'themes', id, 'astro.renderer.config.mjs')),
);

const problemsOf = (line: string): string[] => renderGuardProblems([{ path: 'page.astro', text: line }]);
const ruleText = (id: string): string => RENDER_GUARD_RULES.find((rule) => rule.id === id)?.text ?? '';

// Строка-нарушение → правило. На каждое правило — хотя бы одна строка.
const FORBIDDEN: [string, string][] = [
  ['const products = await fetch(apiUrl);', 'network'],
  ['const url = process.env.PUBLIC_MERFY_API_URL;', 'env'],
  ['const url = import.meta.env.PUBLIC_MERFY_API_URL;', 'env'],
  ['<p>© {new Date().getFullYear()}</p>', 'time'],
  ['const id = Math.random().toString(36);', 'random'],
  ['const id = crypto.randomUUID();', 'random'],
  ['<span>{price.toLocaleString()}</span>', 'process-locale'],
  ['const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;', 'process-locale'],
  ['<link rel="canonical" href={Astro.url.href} />', 'request'],
];

const ALLOWED = [
  'const page = Astro.locals.merfy;',
  '<p>© {page.year} {page.shop.name}</p>',
  "const price = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(2300);",
  '<link rel="canonical" href={head.canonical} />',
];

describe('renderGuardProblems', () => {
  it('у каждого правила есть строка-нарушение в таблице теста', () => {
    expect(new Set(FORBIDDEN.map(([, id]) => id))).toEqual(new Set(RENDER_GUARD_RULES.map((rule) => rule.id)));
  });

  it.each(FORBIDDEN)('«%s» — нарушение: %s', (line, id) => {
    expect(problemsOf(line)).toEqual([`page.astro:1: ${ruleText(id)} — ${line}`]);
  });

  it.each(ALLOWED)('«%s» — можно', (line) => {
    expect(problemsOf(line)).toEqual([]);
  });

  it('номер строки — от единицы', () => {
    const problems = renderGuardProblems([
      { path: 'src/shop/pages/index.astro', text: '---\n\nconst now = Date.now();' },
    ]);
    expect(problems).toEqual([`src/shop/pages/index.astro:3: ${ruleText('time')} — const now = Date.now();`]);
  });
});

describe('страницы магазина новых тем', () => {
  it.each(NEW_THEMES)('в коде страниц магазина темы %s нарушений нет', async (themeId) => {
    const sources = await readShopSources(ROOT, themeId);
    expect(sources.length).toBeGreaterThan(0);
    expect(renderGuardProblems(sources)).toEqual([]);
  });
});
