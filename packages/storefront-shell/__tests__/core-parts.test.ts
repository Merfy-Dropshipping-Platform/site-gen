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

// Корзина — на сервере с блока 9 (часть 9а): её тесты — sdk-cart.test.ts.

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
