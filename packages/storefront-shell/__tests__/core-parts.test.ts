import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineSection } from '../src/core/define';
import { auth } from '../src/core/parts/auth';
import { cart } from '../src/core/parts/cart';
import { favorites } from '../src/core/parts/favorites';
import { start, type StartedCore } from '../src/core/start';
import type { Ctx } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// Части SDK в новом виде (design.md блока 5, раздел 3.12; каталоги блоков 9 и 10): сторы { get } и действия с Result,
// данные — в памяти страницы до блоков 9 и 10.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
  document.head.innerHTML = configTag('live');
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Секция с модулями по uses: тест сохраняет её ctx.
function startWithCtx(uses: Array<'cart' | 'favorites' | 'auth'>) {
  const box: { ctx: Ctx | null } = { ctx: null };
  placeSection('shop:probe', 'probe-1');
  core = start({
    parts: [auth, cart, favorites],
    sections: [entry('shop:probe', defineSection({ mount: (_el, ctx) => void (box.ctx = ctx) }), { uses })],
  });
  return box;
}

describe('корзина', () => {
  it('add — Promise<Result<CartState>>, строки складываются по товару и варианту; $count — сумма штук', async () => {
    const box = startWithCtx(['cart']);
    const cartModule = box.ctx?.cart;
    const first = await cartModule?.add({ productId: 'p12', quantity: 2 });
    await cartModule?.add({ productId: 'p12', quantity: 1 });
    const third = await cartModule?.add({ productId: 'p12', variantId: 'v-red' });
    expect(first).toEqual({
      ok: true,
      data: { ready: true, lines: [{ id: 'p12', productId: 'p12', variantId: null, quantity: 2 }] },
    });
    expect(third).toEqual({
      ok: true,
      data: {
        ready: true,
        lines: [
          { id: 'p12', productId: 'p12', variantId: null, quantity: 3 },
          { id: 'p12:v-red', productId: 'p12', variantId: 'v-red', quantity: 1 },
        ],
      },
    });
    expect(cartModule?.$count.get()).toBe(4);
  });

  it('remove({ lineId }) убирает строку; значения сторов заморожены', async () => {
    const box = startWithCtx(['cart']);
    const cartModule = box.ctx?.cart;
    await cartModule?.add({ productId: 'p12' });
    const removed = await cartModule?.remove({ lineId: 'p12' });
    expect(removed).toEqual({ ok: true, data: { ready: true, lines: [] } });
    expect(cartModule?.$count.get()).toBe(0);
    expect(Object.isFrozen(cartModule?.$cart.get())).toBe(true);
    expect(Object.isFrozen(cartModule)).toBe(true);
  });

  it.each([
    ['пустой productId', { productId: '' }],
    ['количество 0', { productId: 'p12', quantity: 0 }],
    ['дробное количество', { productId: 'p12', quantity: 1.5 }],
  ])('%s — { ok: false, error.code: invalid }, без исключения', async (_case, args) => {
    const box = startWithCtx(['cart']);
    const result = await box.ctx?.cart.add(args);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(box.ctx?.cart.$count.get()).toBe(0);
  });

  it('удалить строку, которой нет, — invalid', async () => {
    const box = startWithCtx(['cart']);
    expect(await box.ctx?.cart.remove({ lineId: 'p404' })).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('разметка без скрипта: data-action="cart.add" с data-product-id и data-quantity — значок по ctx.watch(ctx.cart.$count)', async () => {
    const buy = placeSection(
      'shop:buy',
      'buy-1',
      '<button data-action="cart.add" data-product-id="p12" data-quantity="2">В корзину</button>',
    );
    const badge = placeSection('shop:badge', 'badge-1', '<span data-ref="count">0</span>');
    const badgeSection = defineSection({
      mount: (_el, ctx) => void ctx.watch(ctx.cart.$count, (count) => ctx.ref('count')?.text(count)),
    });
    core = start({
      parts: [auth, cart, favorites],
      sections: [entry('shop:badge', badgeSection, { uses: ['cart'] })],
    });
    buy.querySelector('button')?.click();
    await tick();
    expect(badge.querySelector('[data-ref="count"]')?.textContent).toBe('2');
    buy.querySelector('button')?.click();
    await tick();
    expect(badge.querySelector('[data-ref="count"]')?.textContent).toBe('4');
  });

  it('разметка: data-action="cart.remove" с data-line-id', async () => {
    const box = startWithCtx(['cart']);
    await box.ctx?.cart.add({ productId: 'p12' });
    const row = placeSection(
      'shop:row',
      'row-1',
      '<button data-action="cart.remove" data-line-id="p12">Убрать</button>',
    );
    row.querySelector('button')?.click();
    await tick();
    expect(box.ctx?.cart.$count.get()).toBe(0);
  });
});

describe('избранное и вход', () => {
  it('toggle({ productId }) — { added }; $favorites и $count', async () => {
    const box = startWithCtx(['favorites']);
    const module = box.ctx?.favorites;
    expect(await module?.toggle({ productId: 'p12' })).toEqual({ ok: true, data: { added: true } });
    expect(module?.$favorites.get()).toEqual({ ready: true, ids: ['p12'] });
    expect(module?.$count.get()).toBe(1);
    expect(await module?.toggle({ productId: 'p12' })).toEqual({ ok: true, data: { added: false } });
    expect(module?.$count.get()).toBe(0);
    expect(await module?.toggle({ productId: '' })).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('разметка: data-action="favorites.toggle" с data-product-id', async () => {
    const box = startWithCtx(['favorites']);
    const heart = placeSection(
      'shop:heart',
      'heart-1',
      '<button data-action="favorites.toggle" data-product-id="p12">♡</button>',
    );
    heart.querySelector('button')?.click();
    await tick();
    expect(box.ctx?.favorites.$favorites.get().ids).toEqual(['p12']);
  });

  it('вход — гостья: $customer { ready: true, customer: null }', () => {
    const box = startWithCtx(['auth']);
    expect(box.ctx?.auth.$customer.get()).toEqual({ ready: true, customer: null });
  });

  it('модули без uses в ctx нет, части созданы на страницу', () => {
    const box = startWithCtx([]);
    expect(box.ctx === null ? null : ['cart', 'favorites', 'auth'].filter((name) => name in (box.ctx ?? {}))).toEqual(
      [],
    );
    expect(failures.details).toEqual([]);
  });
});
