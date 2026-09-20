/**
 * Чекаут заливает корзину на сервер ОДНИМ действием, а сводка не
 * перестраивается без причины.
 *
 * Что было (замер 20.09 на живом стенде bloom, корзина из шести товаров):
 * `themes/<тема>/src/pages/checkout.astro` звал `cs.addItem` в цикле по
 * позициям. Каждый вызов — POST на позицию, следом GET всей корзины и
 * `cart:updated`. Итог на шести товарах: 8 событий `cart:updated`, 9 полных
 * перестроений списка сводки (покупатель видит, как список растёт
 * 1→2→3→4→5→6, а фотографии перекладываются) и 6 циклов «список → лоудер →
 * список» в блоке доставки — то самое мерцание «Считаем варианты доставки…».
 * После правки на том же стенде: 1 событие, 1 цикл лоудера.
 *
 * Почему гард сторожит ИСХОДНИК, а не рендер. Поведение здесь — сетевое:
 * «сколько раз сходили на сервер и сколько раз перерисовали». Ни снимки
 * секций, ни рендер-гарды его не видят: разметка в обоих случаях одинаковая,
 * отличается только число перерисовок. Поведенческий прогон в jsdom живёт в
 * `packages/theme-base/__tests__` — но CI не гоняет из `packages/` НИ ОДНОГО
 * теста (проверено 20.09: все 133 пути гардов лежат в `src/`), поэтому
 * защита, которая реально работает в CI, должна стоять здесь.
 *
 * Обход гарда возможен (переименовать метод, спрятать цикл) — но тогда это
 * осознанное действие, а не случайный откат к «по одному товару».
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

/** Инлайн-скрипты страницы: у .astro их может быть несколько. */
function scripts(src: string): string {
  return Array.from(src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
    .map((m) => m[1])
    .join('\n');
}

describe('чекаут: корзина уезжает на сервер одним действием', () => {
  it.each(THEMES)('%s — страница чекаута существует и не добавляет позиции по одной', (theme) => {
    const page = join(ROOT, 'themes', theme, 'src', 'pages', 'checkout.astro');
    // Пропуск = зелёный тест ни о чём. Нет файла — это провал, а не «нечего проверять».
    expect(existsSync(page)).toBe(true);

    const body = scripts(readFileSync(page, 'utf-8'));
    // Цикл по позициям с await-добавлением — ровно то, что давало шесть
    // перерисовок. Ищем сам вызов: он допустим только вне чекаута.
    expect(body).not.toMatch(/await\s+cs\.addItem\s*\(/);
    expect(body).not.toMatch(/await\s+(window\.)?cartStore\.addItem\s*\(/);
  });

  it.each(THEMES)('%s — cart-store умеет залить весь список одним действием', (theme) => {
    const store = join(ROOT, 'themes', theme, 'public', 'scripts', 'cart-store.js');
    expect(existsSync(store)).toBe(true);

    const src = readFileSync(store, 'utf-8');
    const hasOneShot = /async\s+syncLinesToServer\s*\(/.test(src) || /async\s+syncToServer\s*\(/.test(src);
    expect(hasOneShot).toBe(true);
  });
});

describe('сводка заказа: перестраивается только при смене состава', () => {
  const block = join(
    ROOT, 'packages', 'theme-base', 'blocks', 'CheckoutOrderSummary', 'CheckoutOrderSummary.astro',
  );

  it('блок на месте', () => {
    expect(existsSync(block)).toBe(true);
  });

  it('innerHTML пишется только когда разметка отличается от уже показанной', () => {
    const body = scripts(readFileSync(block, 'utf-8'));
    // Разметка собирается в строку…
    expect(body).toMatch(/var\s+html\s*=\s*items\.map\(renderItem\)\.join\(/);
    // …и уходит в DOM ТОЛЬКО если отличается от того, что там уже есть.
    expect(body).toMatch(/if\s*\(\s*html\s*!==\s*itemsEl\.innerHTML\s*\)\s*itemsEl\.innerHTML\s*=\s*html/);
    // Безусловной записи остаться не должно.
    expect(body).not.toMatch(/\n\s*itemsEl\.innerHTML\s*=\s*items\.map\(renderItem\)/);
  });
});

describe('доставка: пересчёт не убирает уже показанные варианты', () => {
  const block = join(
    ROOT, 'packages', 'theme-base', 'blocks', 'CheckoutDeliveryMethod', 'CheckoutDeliveryMethod.astro',
  );

  it('блок на месте', () => {
    expect(existsSync(block)).toBe(true);
  });

  it('showLoading оставляет непустой список на экране', () => {
    const body = scripts(readFileSync(block, 'utf-8'));
    const m = /function\s+showLoading\s*\(\)\s*\{([\s\S]*?)\n\s{4}\}/.exec(body);
    expect(m).not.toBeNull();
    const fn = (m as RegExpExecArray)[1];
    // Есть ранний выход, когда варианты уже нарисованы: иначе каждый пересчёт
    // прячет список и показывает большой лоудер — это и есть мерцание.
    expect(fn).toMatch(/listEl\.children\.length/);
    expect(fn).toMatch(/return;/);
  });
});
