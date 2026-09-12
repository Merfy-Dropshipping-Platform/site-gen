/**
 * Регистр вариантов на витрине: пять тем, один ответ.
 *
 * Продолжение product-variants-text-case.spec.ts, но для второго пути рендера:
 * значения вариантов дорисовывает клиентская гидрация темы
 * (`renderVariantGroupsHtml` в themes/<тема>/src/lib/storefront-hydrate.ts).
 * Имя группы («Размер») и её значения («средний», «синий металлик») — данные
 * мерчанта, и показывать их надо в том регистре, в каком он их ввёл
 * (баг-репорт владельца 2026-09-12: «дать настоящие значения и вырезать капс»).
 *
 * Вызываем РЕАЛЬНУЮ функцию каждой темы и смотрим на полученную разметку, а не
 * на текст исходника. Капс в подписях самой темы («В КОРЗИНУ») тест не трогает —
 * это оформление, а не данные.
 */

import { renderVariantGroupsHtml as rose } from '../../../themes/rose/src/lib/storefront-hydrate';
import { renderVariantGroupsHtml as vanilla } from '../../../themes/vanilla/src/lib/storefront-hydrate';
import { renderVariantGroupsHtml as flux } from '../../../themes/flux/src/lib/storefront-hydrate';
import { renderVariantGroupsHtml as satin } from '../../../themes/satin/src/lib/storefront-hydrate';
import { renderVariantGroupsHtml as bloom } from '../../../themes/bloom/src/lib/storefront-hydrate';

type Renderer = (
  groups: { name: string; values: string[] }[],
  selected: Record<string, string>,
) => string;

const THEMES: [string, Renderer][] = [
  ['rose', rose as Renderer],
  ['vanilla', vanilla as Renderer],
  ['flux', flux as Renderer],
  ['satin', satin as Renderer],
  ['bloom', bloom as Renderer],
];

/** Значения намеренно строчные — ровно так их вводит мерчант. */
const GROUPS = [
  { name: 'Размер', values: ['средний', 'большой'] },
  { name: 'Цвет', values: ['синий металлик'] },
];

/** Классы узлов, внутри которых стоит текст мерчанта. */
function classesAroundMerchantText(html: string): string[] {
  const out: string[] = [];
  const re = /<(span|button|label|option)\b([^>]*)>([^<]*)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[3].trim();
    if (!text) continue;
    const isMerchantText = ['Размер', 'Цвет', 'средний', 'большой', 'синий металлик'].includes(text);
    if (!isMerchantText) continue;
    out.push(/class="([^"]*)"/.exec(m[2])?.[1] ?? '');
  }
  return out;
}

describe.each(THEMES)('%s — регистр вариантов в гидрации витрины', (theme, render) => {
  const html = render(GROUPS, { Размер: 'средний' });

  it('имя группы и значения нашлись в разметке как есть', () => {
    expect(html).toContain('Размер');
    expect(html).toContain('средний');
    expect(html).toContain('синий металлик');
    expect(classesAroundMerchantText(html).length).toBeGreaterThan(0);
  });

  it('ни один узел с текстом мерчанта не красит его в верхний регистр', () => {
    const offenders = classesAroundMerchantText(html).filter((c) => /\buppercase\b/.test(c));
    expect({ theme, offenders }).toEqual({ theme, offenders: [] });
  });
});
