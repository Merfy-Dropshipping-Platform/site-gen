import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, ACTION_NAMES, isActionName, markupParams } from '../src/core/action-catalog';
import { defineSection } from '../src/core/define';
import { NOTICE_TEXT } from '../src/core/failures';
import { auth } from '../src/core/parts/auth';
import { cart } from '../src/core/parts/cart';
import { consent } from '../src/core/parts/consent';
import { favorites } from '../src/core/parts/favorites';
import { newsletter } from '../src/core/parts/newsletter';
import { search } from '../src/core/parts/search';
import { variants } from '../src/core/parts/variants';
import { start, type StartedCore } from '../src/core/start';
import type { Ctx, SdkPart } from '../src/core/types';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { API_URL, SHOP_ID, fakeCore, fakeGateway } from './sdk-support';

// Таблица действий SDK (блок 9, «Решил сам» п. 18) и подписка на рассылку (раздел 3.22 блока 1, таблица «Действия»).
const PARTS: readonly SdkPart<string, unknown>[] = [auth, cart, consent, favorites, newsletter, search, variants];
let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('таблица действий', () => {
  it('действия блоков 9, 10 и 11; имя — «модуль.функция»', () => {
    expect([...ACTION_NAMES].sort()).toEqual([
      'cart.add',
      'cart.change',
      'cart.checkout',
      'cart.open',
      'cart.remove',
      'consent.accept',
      'consent.decline',
      'favorites.toggle',
      'newsletter.subscribe',
      'search.open',
      'variants.pick',
    ]);
    expect(isActionName('cart.add')).toBe(true);
    expect(isActionName('cart.ad')).toBe(false);
    expect(isActionName('cart.delete')).toBe(false);
  });

  it('у каждого действия есть функция в API своей части', () => {
    const missing = ACTION_NAMES.filter((name) => {
      const [module, method] = name.split('.');
      const part = PARTS.find((candidate) => candidate.name === module);
      const api: unknown = part?.create(fakeCore().core);
      return typeof api !== 'object' || api === null || typeof Reflect.get(api, method ?? '') !== 'function';
    });
    expect(missing).toEqual([]);
    expect(ACTION_NAMES.every((name) => isActionName(name) && name.startsWith(`${ACTIONS[name].module}.`))).toBe(true);
  });

  it('действия разметки частей и таблица — одно и то же, параметры тоже', () => {
    const fromParts = PARTS.flatMap((part) =>
      Object.entries(part.markup ?? {}).map(([method, action]) => `${part.name}.${method}: ${action.params.join(' ')}`),
    );
    const fromTable = ACTION_NAMES.filter(isActionName)
      .filter((name) => ACTIONS[name].markup !== null)
      .map((name) => `${name}: ${markupParams(name).join(' ')}`);
    expect(fromParts.sort()).toEqual(fromTable.sort());
    expect(markupParams('newsletter.subscribe')).toEqual([]);
  });
});

describe('newsletter.subscribe', () => {
  const subscribe = (email: string, quiet = false) => {
    const fake = fakeCore();
    const api = newsletter.create(fake.core);
    return { fake, result: api.subscribe({ email }, { quiet }) };
  };

  it('тот же запрос, что у rose и flux: POST /storefront/newsletter/subscribe с { store_id, email }', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /storefront/newsletter/subscribe', {
      status: 200,
      body: { subscribed: true, alreadySubscribed: false },
    });
    const { result } = subscribe(' anna@example.ru ');
    expect(await result).toEqual({ ok: true, data: { alreadySubscribed: false } });
    expect(gateway.calls).toEqual([
      { key: 'POST /storefront/newsletter/subscribe', body: { store_id: SHOP_ID, email: 'anna@example.ru' } },
    ]);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${API_URL}/storefront/newsletter/subscribe`);
  });

  it('уже подписан — ok с alreadySubscribed: true', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /storefront/newsletter/subscribe', {
      status: 200,
      body: { subscribed: true, alreadySubscribed: true },
    });
    expect(await subscribe('anna@example.ru').result).toEqual({ ok: true, data: { alreadySubscribed: true } });
  });

  it.each([
    [{ status: 400, body: { message: ['email must be an email'] } }, 'invalid'],
    [{ status: 404, body: { message: 'SHOP_NOT_FOUND' } }, 'invalid'],
    [{ status: 429, body: null }, 'limit'],
    [{ status: 502, body: null }, 'server'],
    [{ status: 200, body: { subscribed: true } }, 'server'],
    ['network', 'network'],
  ] as const)('ответ %j — код %s', async (reply, code) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    gateway.answer('POST /storefront/newsletter/subscribe', reply);
    expect(await subscribe('anna@example.ru').result).toMatchObject({ ok: false, error: { code } });
  });

  it('с quiet — уведомлений нет: подвал показывает тексты rose и flux под формой', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /storefront/newsletter/subscribe', { status: 429, body: null });
    const { fake, result } = subscribe('anna@example.ru', true);
    expect(await result).toEqual({ ok: false, error: { code: 'limit', message: NOTICE_TEXT['rate-limit'] } });
    expect(fake.events).toEqual([]);
  });

  it('без quiet — уведомление платформы', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /storefront/newsletter/subscribe', 'network');
    const { fake, result } = subscribe('anna@example.ru');
    await result;
    expect(fake.named('merfy:notice:show')).toEqual([
      { level: 'error', message: NOTICE_TEXT.network, code: 'network' },
    ]);
  });

  it('пустой email — invalid без запроса', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    expect(await subscribe('  ').result).toEqual({
      ok: false,
      error: { code: 'invalid', message: 'newsletter.subscribe: email — непустая строка' },
    });
    expect(gateway.calls).toEqual([]);
  });
});

describe('модуль newsletter в секции', () => {
  it('uses: ["newsletter"] — ctx.newsletter.subscribe; без uses модуля нет', () => {
    const failures = watchFailures();
    const box: { footer: Ctx | null; other: Ctx | null } = { footer: null, other: null };
    document.head.innerHTML = configTag('live');
    placeSection('shop:footer', 'footer-1');
    placeSection('shop:hint', 'hint-1');
    core = start({
      parts: [newsletter],
      sections: [
        entry('shop:footer', defineSection({ mount: (_el, ctx) => void (box.footer = ctx) }), { uses: ['newsletter'] }),
        entry('shop:hint', defineSection({ mount: (_el, ctx) => void (box.other = ctx) })),
      ],
    });
    failures.stop();
    expect(typeof box.footer?.newsletter.subscribe).toBe('function');
    expect(box.other === null ? null : 'newsletter' in box.other).toBe(false);
    expect(failures.details).toEqual([]);
  });
});
