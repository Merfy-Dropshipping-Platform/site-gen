// Проверка меток витрины в настоящем Chromium. Страница — не наше ядро, а скрипт с той же внешней стороной: метка живая,
// если нажатие дало запрос и новое значение, мёртвая — если нет. Настоящее ядро на настоящем магазине проверяет снимок на
// dev. Пропускается, если браузера Playwright нет.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { ChromiumRenderer } from '../src/look/look-browser';
import { cartReply, itemReply } from '../src/look/look-marks';
import type { MarkResult } from '../src/look/look-types';

const hasChromium = existsSync(chromium.executablePath());

const CONFIG = `<script id="merfy-config" type="application/json">{"shop":{"url":"https://marks.merfy.ru"}}</script>`;

const LIVE_SCRIPT = `<script>
document.addEventListener('click', async (event) => {
  const node = event.target.closest('[data-action]');
  if (!node) return;
  const name = node.getAttribute('data-action');
  if (name === 'favorites.toggle') {
    node.setAttribute('aria-pressed', String(node.getAttribute('aria-pressed') !== 'true'));
  }
  if (name === 'cart.add') {
    const cart = await fetch('https://gateway.merfy.ru/api/store/carts', { method: 'POST', body: '{}' });
    const { cart: { id } } = await cart.json();
    await fetch('https://gateway.merfy.ru/api/store/carts/' + id + '/items', {
      method: 'POST',
      body: JSON.stringify({ product_id: node.getAttribute('data-product-id') }),
    });
    document.querySelector('[data-ref="cart-count"]').textContent = '1';
  }
});
</script>`;

const page = (body: string, script = ''): string =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">${CONFIG}</head><body>${body}${script}</body></html>`;

const SECTION = `<div data-section-id="s1">
  <button data-action="cart.add" data-product-id="p1">В корзину</button>
  <button data-action="favorites.toggle" data-product-id="p1" aria-pressed="false">♥</button>
</div><span data-ref="cart-count">0</span>`;

describe('подмена записи в корзину', () => {
  it('количество растёт с каждым добавлением: повтор проверки двигает счётчик, как настоящая корзина', () => {
    const quantityOf = (reply: unknown): unknown => Reflect.get(Object(Reflect.get(Object(reply), 'item')), 'quantity');
    expect(quantityOf(itemReply({ product_id: 'p1' }, 1))).toBe(1);
    expect(quantityOf(itemReply({ product_id: 'p1' }, 2))).toBe(2);
    expect(quantityOf(itemReply({ product_id: 'p1', quantity: 3 }, 2))).toBe(6);
  });

  it('чтение созданной корзины: строка с числом добавлений, до добавления — пусто', () => {
    const items = (writes: string[]): unknown => Reflect.get(Object(cartReply(writes)), 'items');
    expect(items(['POST /api/store/carts'])).toEqual([]);
    const added = ['POST /api/store/carts', 'POST /api/store/carts/c/items', 'POST /api/store/carts/c/items'];
    expect(items(added)).toEqual([expect.objectContaining({ id: 'look-line', quantity: 2 })]);
  });
});

describe.skipIf(!hasChromium)('метки витрины · настоящий Chromium', () => {
  const renderer = new ChromiumRenderer();
  afterAll(() => renderer.close());

  async function marksOf(html: string, section?: string): Promise<MarkResult[]> {
    const rendered = await renderer.open({ html, devices: ['desktop'] });
    try {
      const [session] = rendered.sessions;
      if (session === undefined) throw new Error('нет экрана');
      return await session.marks(8_000, section);
    } finally {
      await rendered.close();
    }
  }

  const statusOf = (results: MarkResult[], mark: string): string | undefined =>
    results.find((result) => result.mark === mark)?.status;

  it('живые метки: корзина и сердечко отвечают, запись на шлюз не уходит', async () => {
    const results = await marksOf(page(SECTION, LIVE_SCRIPT), 's1');
    expect(statusOf(results, 'cart.add')).toBe('ok');
    expect(statusOf(results, 'favorites.toggle')).toBe('ok');
  });

  it('дизайн нарисован, ядро не подключено: метки красные с понятным текстом', async () => {
    const results = await marksOf(page(SECTION));
    expect(statusOf(results, 'cart.add')).toBe('broken');
    expect(statusOf(results, 'favorites.toggle')).toBe('broken');
    expect(results.find((result) => result.mark === 'cart.add')?.text).toContain('не положила товар');
  });

  it('метки нет — проверки нет', async () => {
    expect(await marksOf(page('<p>Просто текст</p>'))).toEqual([]);
  });

  it('ядро перечитывает корзину после добавления: ответ подмены, а не 404 шлюза', async () => {
    const reread = `<script>
      document.addEventListener('click', async (event) => {
        const node = event.target.closest('[data-action="cart.add"]');
        if (!node) return;
        const base = 'https://gateway.merfy.ru/api/store/carts';
        const created = await (await fetch(base, { method: 'POST', body: '{}' })).json();
        const id = created.cart.id;
        await fetch(base + '/' + id + '/items', { method: 'POST', body: JSON.stringify({ product_id: 'p1' }) });
        const read = await fetch(base + '/' + id);
        const count = read.ok ? (await read.json()).items[0].quantity : 0;
        document.querySelector('[data-ref="cart-count"]').textContent = String(count);
      });
    </script>`;
    const button = '<button data-action="cart.add" data-product-id="p1">+</button>';
    const results = await marksOf(page(`${button}<span data-ref="cart-count">0</span>`, reread));
    expect(statusOf(results, 'cart.add')).toBe('ok');
  });

  it('метка скрыта или без товара — не поломка', async () => {
    const hidden = '<button hidden data-action="cart.add" data-product-id="p1">В корзину</button>';
    expect(statusOf(await marksOf(page(hidden)), 'cart.add')).toBe('hidden');
    const empty = '<button data-action="cart.add" data-product-id="">В корзину</button>';
    expect(statusOf(await marksOf(page(empty)), 'cart.add')).toBe('hidden');
    const off = '<button disabled data-action="cart.add" data-product-id="p1">Нет в наличии</button>';
    expect(statusOf(await marksOf(page(off)), 'cart.add')).toBe('hidden');
  });

  it('метка с событием перед именем тоже находится', async () => {
    const results = await marksOf(page('<button data-action="click:cart.add" data-product-id="p1">+</button>'));
    expect(statusOf(results, 'cart.add')).toBe('broken');
  });

  it('только своя секция: метки другой секции не трогаются', async () => {
    const other = `<div data-section-id="s2"><button data-action="cart.add" data-product-id="p2">+</button></div>`;
    expect(await marksOf(page(`<div data-section-id="s1"><p>Текст</p></div>${other}`), 's1')).toEqual([]);
  });

  it('кнопка корзины без ссылки и без выезжающей корзины никуда не ведёт', async () => {
    const button = await marksOf(page('<button data-action="cart.open">Корзина</button>'));
    expect(statusOf(button, 'cart.open')).toBe('broken');
    const link = await marksOf(page('<a data-action="cart.open" href="/cart">Корзина</a>'));
    expect(statusOf(link, 'cart.open')).toBe('ok');
  });

  it('упавшая секция — красная с причиной из журнала ядра, ссылка профиля — на вход или в кабинет', async () => {
    const log = `<script>console.error('Сбой секции shop:hero#s1 (mount): ключ «firstAt» хранилища — kebab-case')</script>`;
    const failed = await marksOf(page(`<div data-section-id="s1" data-merfy-state="failed"></div>${log}`));
    expect(statusOf(failed, 'section')).toBe('broken');
    expect(failed[0]?.text).toBe('скрипт секции упал: ключ «firstAt» хранилища — kebab-case');
    const silent = await marksOf(page('<div data-section-id="s1" data-merfy-state="failed"></div>'));
    expect(silent[0]?.text).toBe('скрипт секции упал: её функции не работают');
    const profile = await marksOf(page('<a data-ref="profile" href="/login">Профиль</a>'));
    expect(statusOf(profile, 'profile')).toBe('ok');
    const wrong = await marksOf(page('<a data-ref="profile" href="#">Профиль</a>'));
    expect(statusOf(wrong, 'profile')).toBe('broken');
  });

  it('окно, всплывшее поверх страницы, не даёт ложного красного: повтор после его закрытия', async () => {
    const popup = `<dialog id="popup"><p>Скидка</p></dialog><script>
      document.getElementById('popup').showModal();
      document.addEventListener('click', (event) => {
        const heart = event.target.closest?.('[data-action="favorites.toggle"]');
        if (heart && !document.querySelector('dialog:modal')) heart.setAttribute('aria-pressed', 'true');
      });
    </script>`;
    const heart = '<button data-action="favorites.toggle" data-product-id="p1" aria-pressed="false">♥</button>';
    expect(statusOf(await marksOf(page(`${heart}${popup}`)), 'favorites.toggle')).toBe('ok');
  });

  it('срок вышел: метка не проверена, а не сломана', async () => {
    const rendered = await renderer.open({ html: page(SECTION), devices: ['desktop'] });
    try {
      const results = (await rendered.sessions[0]?.marks(0)) ?? [];
      expect(results.map((result) => result.status)).toEqual(['hidden', 'hidden']);
    } finally {
      await rendered.close();
    }
  });

  // Строка корзины, как её рисует ядро: после записи перечитывает корзину и рисует строку новыми узлами (пауза — это
  // чтение), «−» при одной штуке — количество 0, то есть DELETE (`cart-change.ts`). 17.11 на странице корзины проверка жала
  // «−», ждала PATCH, а на повторе висела на пропавшей кнопке до общего срока — терялись все метки страницы.
  const CART_LINE = (quantity: number, buttons: 'all' | 'less'): string => `<div id="line"></div><script>
    const base = 'https://gateway.merfy.ru/api/store/carts/c-1/items/l-1';
    let quantity = ${quantity};
    const button = (action, next, text) =>
      '<button data-action="' + action + '" data-line-id="l-1" data-quantity="' + next + '">' + text + '</button>';
    const draw = () => {
      document.getElementById('line').innerHTML = quantity === 0 ? '' : button('cart.change', quantity - 1, '−') +
        ${buttons === 'all' ? `button('cart.change', quantity + 1, '+') + button('cart.remove', 0, 'Удалить')` : `''`};
    };
    document.addEventListener('click', async (event) => {
      const node = event.target.closest('[data-action]');
      if (!node) return;
      const next = Number(node.getAttribute('data-quantity'));
      await fetch(base, { method: next === 0 ? 'DELETE' : 'PATCH', body: JSON.stringify({ quantity: next }) });
      await new Promise((done) => setTimeout(done, 150));
      quantity = next;
      draw();
    });
    draw();
  </script>`;

  it('строка корзины перерисовывается после записи: «+» вместо «−» при одной штуке, «Удалить» ищется заново', async () => {
    const started = Date.now();
    const results = await marksOf(page(CART_LINE(1, 'all')));
    expect(statusOf(results, 'cart.change')).toBe('ok');
    expect(statusOf(results, 'cart.remove')).toBe('ok');
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it('у строки только «−» при одной штуке: удаление строки — ответ на cart.change', async () => {
    expect(statusOf(await marksOf(page(CART_LINE(1, 'less'))), 'cart.change')).toBe('ok');
  });

  it('метка пропала после нажатия: не проверена, а не сломана, и срок страницы не съеден', async () => {
    const vanish = `<button data-action="favorites.toggle" data-product-id="p1" aria-pressed="false">♥</button><script>
      document.addEventListener('click', (event) => event.target.closest('[data-action]')?.remove());
    </script>`;
    const started = Date.now();
    const [heart] = await marksOf(page(vanish));
    expect(heart?.status).toBe('hidden');
    expect(heart?.text).toContain('метка пропала');
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it('ссылка под меткой не уводит со страницы посреди проверки', async () => {
    const html = page(`<a href="/product/1"><button data-action="favorites.toggle" data-product-id="p1">♥</button></a>
      <a data-action="cart.open" href="/cart">Корзина</a>`);
    const results = await marksOf(html);
    expect(statusOf(results, 'cart.open')).toBe('ok');
    expect(statusOf(results, 'favorites.toggle')).toBe('broken');
  });
});
