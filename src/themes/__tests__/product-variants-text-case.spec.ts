/**
 * Регистр значений вариантов: витрина показывает то, что ввёл мерчант.
 *
 * Баг-репорт владельца 2026-09-12: «текст во всех инпутах капсом, хотя текст
 * написан маленькими буквами — дать настоящие значения и вырезать капс».
 * Выпадашки вариантов (`<select>` на группу) — единственные инпуты витрины,
 * которые показывали данные мерчанта в верхнем регистре: и имя группы
 * («Размер»), и значения («средний», «синий металлик») перекрашивал в капс
 * класс `uppercase` на самом контроле. Чипы того же блока и порт flux
 * (эталон поведения) капс не ставят — то есть верхний регистр здесь был
 * расхождением одного пути из трёх, а не решением дизайна.
 *
 * Проверяем РЕНДЕРОМ скомпилированного блока (тот же модуль уходит в превью и
 * на витрину), а не чтением исходника. Требует `pnpm build:blocks`.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const PROBE = resolve(__dirname, 'render-product-variants.mjs');

/** Значения намеренно строчные — ровно так их вводит мерчант. */
const GROUPS = [
  {
    key: 'Размер',
    options: [
      { value: 'средний', available: true },
      { value: 'большой', available: true },
    ],
  },
  {
    key: 'Цвет',
    options: [{ value: 'синий металлик', available: true }],
  },
];

function render(props: Record<string, unknown>): string {
  const out = execFileSync('node', [PROBE, JSON.stringify(props)], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = JSON.parse(out) as { html?: string; error?: string };
  if (parsed.error) throw new Error(parsed.error);
  return parsed.html ?? '';
}

/** Класс открывающего тега по имени элемента (первое вхождение). */
function classOf(html: string, tag: string): string {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(html)?.[0] ?? '';
  return /class="([^"]*)"/.exec(open)?.[1] ?? '';
}

describe('ProductVariants — регистр значений мерчанта', () => {
  const dropdown = render({ type: 'dropdown', displayStyle: 'list', groups: GROUPS });

  it('выпадашка не красит значения в верхний регистр', () => {
    expect(classOf(dropdown, 'select')).not.toMatch(/\buppercase\b/);
  });

  it('имя группы («Размер») не красится в верхний регистр', () => {
    expect(classOf(dropdown, 'label')).not.toMatch(/\buppercase\b/);
  });

  it('значения выводятся ровно так, как их ввёл мерчант', () => {
    expect(dropdown).toContain('>средний<');
    expect(dropdown).toContain('>большой<');
    expect(dropdown).toContain('>синий металлик<');
    expect(dropdown).toContain('>Размер<');
  });

  it('чипы (второй режим того же блока) остаются без капса', () => {
    const chips = render({ type: 'chips', displayStyle: 'button', groups: GROUPS });
    expect(chips).not.toMatch(/class="[^"]*\buppercase\b[^"]*"/);
    expect(chips).toContain('средний');
  });
});
