import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY } from '../src/core/analytics/consent';
import { createAnalyticsPart } from '../src/core/analytics/part';
import { consent } from '../src/core/parts/consent';
import { start, type StartedCore } from '../src/core/start';
import type { Mode, SdkPart } from '../src/core/types';
import { corePart, tick } from './core-support';

// Часть SDK «аналитика» в ядре секций (части 5б и 13а): просмотр — по merfy:page:view ядра, корзина — по событиям
// merfy:cart:* (перевод — sdk-events.ts), ответ на баннер — merfy:consent:change, пачка — по pagehide; «свой код»
// мерчанта — после merfy:page:ready, по таблице согласия. Модуль аналитики целиком проверяют analytics-*.test.ts, здесь
// — связь с ядром. Слушатели страниц прошлых тестов остаются на document и window: у каждой страницы свой список
// отправленного, у каждого теста свои метки «своего кода».
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const COLLECTOR = 'https://analytics.dev.merfy.ru';
const PRICE = { amount: 249000, currency: 'RUB' };

interface Custom {
  code: string;
  consent: 'required' | 'none';
}

interface Sent {
  url: string;
  types: string[];
}

let core: StartedCore | undefined;

// Конфиг — элементом, а не строкой HTML: «свой код» с </script> не рвёт тег.
function setConfig(mode: Mode, custom: readonly Custom[] = []): void {
  const analytics = { url: COLLECTOR, counters: [], ...(custom.length > 0 ? { custom } : {}) };
  const config = {
    v: 1,
    mode,
    shop: { id: SHOP, name: 'Шарфы', url: 'https://scarves.example' },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: 'https://gateway.dev.merfy.ru/api' },
    theme: { id: 'nova', version: '0.1.0' },
    page: { id: 'catalog', path: '/catalog' },
    analytics: mode === 'live' ? analytics : null,
  };
  const tag = document.createElement('script');
  tag.type = 'application/json';
  tag.id = 'merfy-config';
  tag.textContent = JSON.stringify(config);
  document.head.replaceChildren(tag);
}

const typesOf = (body: string): string[] => {
  const batch: unknown = JSON.parse(body);
  const events: unknown = typeof batch === 'object' && batch !== null ? Reflect.get(batch, 'events') : [];
  return Array.isArray(events) ? events.map((event: unknown) => String(Reflect.get(Object(event), 'type'))) : [];
};

// Страница с ядром: части по списку и аналитика со своим списком отправленного.
async function openPage(parts: readonly SdkPart<string, unknown>[] = []): Promise<Sent[]> {
  const sent: Sent[] = [];
  let ids = 0;
  const analytics = createAnalyticsPart({
    window,
    beacon: (url, body) => sent.push({ url, types: typesOf(body) }) > 0,
    newId: () => `id-${(ids += 1)}`,
  });
  core = start({ parts: [...parts, analytics], sections: [] }, { window });
  await tick();
  return sent;
}

// Метка выполнения «своего кода» — атрибут <html>: окно vitest jsdom не делегирует в тест новые свойства window из
// vm-контекста скрипта (разрешённая правка теста от 24.10).
const mark = (name: string): string | null => document.documentElement.getAttribute(name);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('часть «аналитика»', () => {
  it('витрина: просмотр по merfy:page:view после запуска; pagehide — пачка в сборщик сразу', async () => {
    setConfig('live');
    const sent = await openPage();
    expect(sent).toEqual([]);
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([{ url: `${COLLECTOR}/collect`, types: ['session_start', 'page_view'] }]);
  });

  it('превью: ничего не уходит', async () => {
    setConfig('preview');
    const sent = await openPage();
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([]);
  });

  it('корзина: merfy:cart:add и merfy:cart:change ядра — «в корзину» и «из корзины» в пачке', async () => {
    setConfig('live');
    const spy = corePart();
    const sent = await openPage([spy.part]);
    const line = { lineId: 'l-1', productId: 'scarf-1', variantId: null };
    spy.box.core?.emit('merfy:cart:add', { ...line, quantity: 2, price: PRICE });
    spy.box.core?.emit('merfy:cart:change', { ...line, quantity: 1, previousQuantity: 2 });
    window.dispatchEvent(new Event('pagehide'));
    // Визит уже начат страницей первого теста файла (её слушатели остались на document) — здесь только просмотр.
    expect(sent.flatMap((item) => item.types)).toEqual(['page_view', 'add_to_cart', 'remove_from_cart']);
  });

  it('«свой код»: «сразу» — после merfy:page:ready, «ждать согласия» — после «Принять», каждый один раз', async () => {
    const bump = (name: string): string =>
      `<script>document.documentElement.setAttribute("${name}", String(Number(document.documentElement.getAttribute("${name}")) + 1))</script>`;
    setConfig('live', [
      { code: bump('data-b13a-waits'), consent: 'required' },
      { code: bump('data-b13a-now'), consent: 'none' },
    ]);
    const spy = corePart();
    await openPage([consent, spy.part]);
    expect([mark('data-b13a-waits'), mark('data-b13a-now')]).toEqual([null, '1']);
    await spy.box.core?.part('consent').accept();
    await spy.box.core?.part('consent').accept();
    expect([mark('data-b13a-waits'), mark('data-b13a-now')]).toEqual(['1', '1']);
    expect(localStorage.getItem(CONSENT_KEY)).not.toBeNull();
  });

  it('«свой код» с ожиданием и «Отклонить» — не запускается', async () => {
    setConfig('live', [
      {
        code: '<script>document.documentElement.setAttribute("data-b13a-declined", "1")</script>',
        consent: 'required',
      },
    ]);
    const spy = corePart();
    await openPage([consent, spy.part]);
    await spy.box.core?.part('consent').decline();
    expect(mark('data-b13a-declined')).toBeNull();
  });
});
