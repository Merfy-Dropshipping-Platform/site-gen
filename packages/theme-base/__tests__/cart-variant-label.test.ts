import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { variantLabel } from '../runtime/nt-cart';

/**
 * Баг тестера #7 (18.09): «Rose: корзина не показывает вариант — добавил два
 * разных оттенка одного тинта, в /cart две одинаковые строки „Глянцевый тинт
 * для губ púsy 910 ₽“. В хранилище у позиции только variantCombinationId,
 * названия оттенка нет. Ожидаемо: в строке видно „— Cold Brew“».
 *
 * Причина: страница товара сворачивала выбранные опции в ДВА поля — color и
 * size, узнавая ровно имена групп «Цвет»/«Color» и «Размер»/«Size»
 * (`Product.astro`). Группа «Оттенок» (и любая другая — «Объём», «Вкус») в
 * позицию не попадала: оставался только `variantCombinationId`, а подпись
 * строки все пять тем собирали из `variant.color` + `variant.size`, то есть
 * из пустоты.
 *
 * Лечится переносом ПРОИЗВОЛЬНЫХ опций в позицию и одной общей подписью.
 */
describe('подпись варианта в строке корзины', () => {
  it('произвольная группа опций попадает в подпись', () => {
    expect(variantLabel({ options: { 'Оттенок': 'Cold Brew' } })).toBe('Cold Brew');
  });

  it('несколько опций идут через запятую в порядке объявления', () => {
    expect(variantLabel({ options: { 'Цвет': 'Красный', 'Размер': 'M' } })).toBe('Красный, M');
  });

  it('старые позиции (color/size) продолжают подписываться', () => {
    expect(variantLabel({ color: 'Красный', size: 'M' })).toBe('Красный, M');
    expect(variantLabel({ color: 'Красный' })).toBe('Красный');
  });

  it('options важнее устаревших color/size, дублей в подписи нет', () => {
    expect(variantLabel({ options: { 'Цвет': 'Синий' }, color: 'Синий' })).toBe('Синий');
  });

  it('пустое и мусорное состояние даёт пустую подпись', () => {
    expect(variantLabel(undefined)).toBe('');
    expect(variantLabel({})).toBe('');
    expect(variantLabel({ options: {} })).toBe('');
    expect(variantLabel({ options: { 'Оттенок': '   ' } })).toBe('');
    expect(variantLabel({ variantCombinationId: 'abc' })).toBe('');
  });
});

/**
 * Сторож ЖИВОГО пути: `variantLabel` может быть безупречным, а опции — не
 * доехать ни от страницы товара, ни до строки корзины. Рантайм витрины живёт
 * в инлайн-скриптах `.astro` и в темах, поэтому проверяем сами файлы.
 */
describe('вариант доезжает от страницы товара до корзины', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(__dirname, '..', ...parts), 'utf8');

  it('страница товара отдаёт ВСЕ выбранные опции, а не только цвет и размер', () => {
    const astro = read('blocks', 'Product', 'Product.astro');
    expect(astro).toContain("setAttribute('data-variant-options'");
    expect(astro).toContain('JSON.stringify(optsOut)');
  });

  it('рантайм корзины кладёт опции в позицию', () => {
    const rt = read('runtime', 'nt-cart.ts');
    expect(rt).toContain('parseVariantOptions(addBtn.dataset.variantOptions)');
  });

  it('страница корзины и сводка заказа переносят опции позиции', () => {
    for (const file of [
      ['blocks', 'CartBody', 'CartBody.astro'],
      ['blocks', 'CheckoutOrderSummary', 'CheckoutOrderSummary.astro'],
    ]) {
      expect(read(...file)).toContain('v.options');
    }
  });

  it('все пять тем подписывают строку общим хелпером', () => {
    for (const theme of ['rose', 'flux', 'satin', 'bloom', 'vanilla']) {
      const cart = readFileSync(
        join(__dirname, '..', '..', '..', 'themes', theme, 'src', 'lib', 'cart.ts'),
        'utf8',
      );
      expect(cart).toContain('variantLabel(line.variant)');
      expect(cart).not.toContain('line.variant?.color, line.variant?.size');
    }
  });
});
