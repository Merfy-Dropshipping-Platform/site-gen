import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Баг тестера #7 из первой пачки (18.09): «Кнопка „В корзину“ игнорирует
 * скругление из настроек темы. Настройки темы → „Кнопки“ → „Скругление“ = 0:
 * „Смотреть все товары“ становится квадратной, три кнопки „В корзину“ остаются
 * круглыми пилюлями».
 *
 * Замер на живой витрине (подменой `--radius-button` в :root): «Смотреть все
 * товары» честно идёт 6px → 0px → 40px, а кнопка карточки не двигается. В
 * исходниках видно почему: у bloom класс `rounded-full` (пилюля), у satin
 * скругления нет вовсе — оба значения жёсткие, мимо настройки.
 *
 * Гард держит правило: скругление кнопки «В корзину» в карточке товара всегда
 * выражено через `--radius-button`; собственный вид темы сохраняется её же
 * фолбэком внутри `var()`.
 */
const ROOT = join(__dirname, '..', '..', '..');

const hydrateFile = (theme: string): string | null => {
  for (const p of [
    join(ROOT, 'packages', `theme-${theme}`, 'blocks', 'Catalog', 'storefront-hydrate.ts'),
    join(ROOT, 'themes', theme, 'src', 'lib', 'storefront-hydrate.ts'),
  ]) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return null;
};

/**
 * Класс тега с data-add-to-cart. Тема может собирать его из константы
 * (`class="${CARD_BTN_CLS}"`) — тогда разворачиваем её тело, иначе гард
 * краснел бы на теме, где всё как раз правильно.
 */
function addToCartClass(src: string): string | null {
  // Ищем ТЕГ кнопки, а не первое текстовое вхождение: у satin `data-add-to-cart`
  // сначала упоминается в комментарии над разметкой, и наивный поиск отдавал
  // класс соседней заглушки картинки — на этом попался и гард, и автозамена.
  const m = src.match(/<button[\s\S]{0,900}?data-add-to-cart[\s\S]{0,900}?class="([^"]*)"/);
  if (!m) return null;
  const raw = m[1];
  // Тема может собирать класс из константы (`class="${CARD_BTN_CLS}"`) —
  // разворачиваем её тело, иначе гард краснел бы там, где всё правильно.
  const ref = raw.match(/^\$\{(\w+)\}$/);
  if (!ref) return raw;
  const decl = src.match(
    new RegExp(`const\\s+${ref[1]}\\s*=\\s*([\`"'])([\\s\\S]*?)\\1`),
  );
  return decl ? decl[2] : raw;
}

describe('кнопка «В корзину» слушает скругление из настроек темы', () => {
  it.each(['bloom', 'satin', 'flux'])('%s', (theme) => {
    const src = hydrateFile(theme);
    expect(src).toBeTruthy();
    const cls = addToCartClass(src!);
    expect(cls).toBeTruthy();
    expect(cls).toMatch(/rounded-\[var\(--radius-button/);
    expect(cls).not.toMatch(/rounded-full(?!\s*\))/);
  });
});

/**
 * Секция «Коллекция товаров» рисует кнопку не гидрацией каталога, а карточкой
 * темы — именно там жили жёсткие значения, на которые жаловался тестер:
 * `rounded-[4px]` у flux, `rounded-full` (пилюля) у bloom, у satin скругления
 * не было вовсе. Собственный вид темы сохраняется фолбэком внутри `var()`.
 */
describe('карточка товара: кнопка «В корзину» тоже слушает настройку', () => {
  const CARDS: Array<[string, string]> = [
    ['flux', 'themes/flux/src/components/products/FluxProductCard.astro'],
    ['bloom', 'themes/bloom/src/components/products/BloomProductCard.astro'],
    ['satin', 'themes/satin/src/components/products/SatinProductCard.astro'],
    ['satin (порт)', 'packages/theme-satin/blocks/Catalog/SatinProductCard.astro'],
  ];

  it.each(CARDS)('%s', (_name, rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const i = src.indexOf('data-add-to-cart');
    expect(i).toBeGreaterThan(-1);
    const tag = src.slice(src.lastIndexOf('<', i), src.indexOf('>', i) + 1);
    expect(tag).toMatch(/rounded-\[var\(--radius-button/);
    expect(tag).not.toMatch(/rounded-full/);
  });
});
