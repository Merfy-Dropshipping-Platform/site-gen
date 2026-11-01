import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection, defineStore } from '../src/core/define';
import { pageStores, type PageStores } from '../src/core/own-stores';
import { start, type StartedCore } from '../src/core/start';
import { STORAGE_PREFIX } from '../src/core/storage';
import { atom, readable } from '../src/core/stores';
import type { Json, ReadableStore, SdkPart, StoreEntry } from '../src/core/types';
import { configTag, entry, hash, placeSection, watchFailures } from './core-support';

// Свои сторы (свои сторы, 01.11): стор читает базовый стор и другой свой стор, секция видит значение через ctx.stores,
// писать в стор снаружи нечем, сбой и круг не роняют страницу, стора не из бандла у секции нет, в превью хранилище —
// память. Базовый стор — часть-заглушка cart с фасадом $count, как у ядра.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
  window.localStorage.clear();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  vi.useRealTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Строка списка сторов бандла, как её пишет сборка (bundle.ts).
const store = (name: string, definition: StoreEntry['definition'], uses: StoreEntry['uses'] = []): StoreEntry => ({
  name,
  script: hash('s'),
  uses,
  definition,
});

// Часть cart с одним стором $count — базовый стор ядра для своих сторов.
function cartPart() {
  const count = atom(0);
  const part: SdkPart<'cart', { $count: ReadableStore<number> }> = {
    name: 'cart',
    create: () => ({ $count: readable(count) }),
  };
  return { count, part };
}

// Секция, которая пишет в журнал каждое значение стора name.
function reader(name: string, seen: Json[]) {
  return defineSection({
    mount: (_el, ctx) => void ctx.watch(ctx.stores[name] ?? readable(atom(null)), (v) => seen.push(v)),
  });
}

const hasItems = defineStore<boolean>({
  value: false,
  start(ctx, set) {
    ctx.watch(ctx.cart.$count, (count) => set(count > 0));
  },
});

describe('свой стор читает другие сторы', () => {
  it('базовый стор: значение стора и секции идут за корзиной', () => {
    const cart = cartPart();
    const seen: Json[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    core = start({
      parts: [cart.part],
      sections: [entry('shop:badge', reader('shop:has-items', seen), { uses: ['store:shop:has-items'] })],
      stores: pageStores([store('shop:has-items', hasItems, ['cart'])]),
    });
    cart.count.set(2);
    cart.count.set(3);
    cart.count.set(0);
    expect(seen).toEqual([false, true, false]);
    expect(failures.details).toEqual([]);
  });

  it('другой свой стор: порядок запуска — по зависимостям, а не по списку', () => {
    const cart = cartPart();
    const seen: Json[] = [];
    const offer = defineStore<string>({
      value: 'нет',
      start(ctx, set) {
        const items = ctx.stores['shop:has-items'];
        if (items !== undefined) ctx.watch(items, (has) => set(has === true ? 'показать' : 'нет'));
      },
    });
    document.head.innerHTML = configTag('live');
    placeSection('shop:popup', 'popup-1');
    core = start({
      parts: [cart.part],
      sections: [entry('shop:popup', reader('shop:offer', seen), { uses: ['store:shop:offer'] })],
      stores: pageStores([
        store('shop:offer', offer, ['store:shop:has-items']),
        store('shop:has-items', hasItems, ['cart']),
      ]),
    });
    cart.count.set(1);
    expect(seen).toEqual(['нет', 'показать']);
    expect(failures.details).toEqual([]);
  });

  it('стор запускается до секций: в mount значение уже посчитано', () => {
    const cart = cartPart();
    cart.count.set(4);
    const atMount: Json[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    core = start({
      parts: [cart.part],
      sections: [
        entry(
          'shop:badge',
          defineSection({ mount: (_el, ctx) => void atMount.push(ctx.stores['shop:has-items']?.get() ?? null) }),
          {
            uses: ['store:shop:has-items'],
          },
        ),
      ],
      stores: pageStores([store('shop:has-items', hasItems, ['cart'])]),
    });
    expect(atMount).toEqual([true]);
  });
});

describe('писать в стор может только его код', () => {
  it('фасад в ctx.stores — замороженный { get }: ни set, ни подмены', () => {
    const box: { stores: Readonly<Record<string, ReadableStore<Json>>> | null } = { stores: null };
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    core = start({
      parts: [cartPart().part],
      sections: [
        entry('shop:badge', defineSection({ mount: (_el, ctx) => void (box.stores = ctx.stores) }), {
          uses: ['store:shop:has-items'],
        }),
      ],
      stores: pageStores([store('shop:has-items', hasItems, ['cart'])]),
    });
    const facade = box.stores?.['shop:has-items'];
    expect(facade === undefined ? [] : Object.keys(facade)).toEqual(['get']);
    expect(Object.isFrozen(facade)).toBe(true);
    expect(Object.isFrozen(box.stores)).toBe(true);
    expect(Reflect.set(facade ?? {}, 'set', () => undefined)).toBe(false);
    expect(Reflect.set(box.stores ?? {}, 'shop:has-items', readable(atom(true)))).toBe(false);
    expect(facade?.get()).toBe(false);
  });

  it('у секции без uses ctx.stores пустой', () => {
    const box: { keys: string[] | null } = { keys: null };
    document.head.innerHTML = configTag('live');
    placeSection('shop:hint', 'hint-1');
    core = start({
      parts: [cartPart().part],
      sections: [entry('shop:hint', defineSection({ mount: (_el, ctx) => void (box.keys = Object.keys(ctx.stores)) }))],
      stores: pageStores([store('shop:has-items', hasItems, ['cart'])]),
    });
    expect(box.keys).toEqual([]);
  });
});

describe('сбой стора не роняет страницу', () => {
  it('start бросил — merfy:section:error с именем стора; значение — начальное, секции работают', () => {
    const seen: Json[] = [];
    const mount = vi.fn();
    const broken = defineStore<number>({
      value: 7,
      start() {
        throw new Error('сломался');
      },
    });
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    placeSection('shop:other', 'other-1');
    core = start({
      parts: [],
      sections: [
        entry('shop:badge', reader('shop:broken', seen), { uses: ['store:shop:broken'] }),
        entry('shop:other', defineSection({ mount })),
      ],
      stores: pageStores([store('shop:broken', broken)]),
    });
    expect(failures.details).toEqual([
      { section: 'shop:broken', id: 'shop:broken', script: hash('s'), stage: 'mount', message: 'сломался' },
    ]);
    expect(seen).toEqual([7]);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-section-id="badge-1"]')?.getAttribute('data-merfy-state')).toBe('mounted');
  });

  it('set не JSON — сбой стора; значение остаётся последним, подписки стора сняты', () => {
    const cart = cartPart();
    const seen: Json[] = [];
    const odd = defineStore<number>({
      value: 0,
      start(ctx, set) {
        ctx.watch(ctx.cart.$count, (count) => {
          const next: unknown = count === 2 ? new Date() : count;
          if (typeof next === 'number') set(next);
          else Reflect.apply(set, undefined, [next]);
        });
      },
    });
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    core = start({
      parts: [cart.part],
      sections: [entry('shop:badge', reader('shop:odd', seen), { uses: ['store:shop:odd'] })],
      stores: pageStores([store('shop:odd', odd, ['cart'])]),
    });
    cart.count.set(1);
    cart.count.set(2);
    cart.count.set(3);
    expect(seen).toEqual([0, 1]);
    expect(failures.details.map((item) => [item.section, item.stage])).toEqual([['shop:odd', 'runtime']]);
    expect(failures.details[0]?.message).toContain('значение — JSON');
  });

  it('круг на странице (откат правки): оба стора — сбой store-cycle, читающий их стор и секции работают', () => {
    const seen: Json[] = [];
    const loop = defineStore({ value: 1 });
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    core = start({
      parts: [],
      sections: [entry('shop:badge', reader('shop:c', seen), { uses: ['store:shop:c'] })],
      stores: pageStores([
        store('shop:c', defineStore({ value: 'c' }), ['store:shop:a']),
        store('shop:a', loop, ['store:shop:b']),
        store('shop:b', loop, ['store:shop:a']),
      ]),
    });
    expect(failures.details.map((item) => item.section).sort()).toEqual(['shop:a', 'shop:b']);
    expect(failures.details[0]?.message).toContain('читает сам себя по кругу');
    expect(seen).toEqual(['c']);
  });
});

describe('видимость и среда', () => {
  // Сторов на странице нет совсем — кода сторов в бандле тоже нет, uses "store:…" ядро не знает, как незнакомую часть.
  it.each<[string, PageStores | undefined, string]>([
    ['сторов на странице нет', undefined, 'части store:popups:seen на странице нет'],
    [
      'есть другие сторы',
      pageStores([store('shop:other-store', defineStore({ value: 1 }))]),
      'стора popups:seen на странице нет',
    ],
  ])(
    'стора нет в бандле (выключенное расширение, не опубликован), %s — сбой секции part-unknown, страница работает',
    (_title, stores, message) => {
      const mount = vi.fn();
      document.head.innerHTML = configTag('live');
      placeSection('shop:popup', 'popup-1');
      placeSection('shop:other', 'other-1');
      core = start({
        parts: [],
        sections: [
          entry('shop:popup', defineSection({ mount }), { uses: ['store:popups:seen'] }),
          entry('shop:other', defineSection({ mount })),
        ],
        ...(stores === undefined ? {} : { stores }),
      });
      expect(failures.details.map((item) => [item.section, item.message])).toEqual([['shop:popup', message]]);
      expect(mount).toHaveBeenCalledTimes(1);
    },
  );

  it('ctx стора: хранилище — merfy:s:<имя стора>, события — «<имя стора>:<имя>», таймеры снимает остановка ядра', () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const onShown = (event: Event): void => void events.push(event instanceof CustomEvent ? event.detail : null);
    document.addEventListener('popups:seen:shown', onShown);
    let ticks = 0;
    const seen = defineStore<boolean>({
      value: false,
      start(ctx, set) {
        set(ctx.storage.get('closed') === true);
        ctx.storage.set('closed', true);
        ctx.emit('shown', { at: ctx.page.path });
        ctx.every(100, () => void (ticks += 1));
      },
    });
    document.head.innerHTML = configTag('live');
    core = start({ parts: [], sections: [], stores: pageStores([store('popups:seen', seen)]) });
    vi.advanceTimersByTime(250);
    core.stop();
    core = undefined;
    vi.advanceTimersByTime(1000);
    document.removeEventListener('popups:seen:shown', onShown);
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}popups:seen:closed`)).toBe('true');
    expect(events).toEqual([{ at: '/' }]);
    expect(ticks).toBe(2);
  });

  it('превью: хранилище стора — память страницы, в браузер мерчанта ничего не пишется', () => {
    const seen: Json[] = [];
    const remember = defineStore<boolean>({
      value: false,
      start(ctx, set) {
        ctx.storage.set('closed', true);
        set(ctx.storage.get('closed') === true && ctx.mode === 'preview');
      },
    });
    document.head.innerHTML = configTag('preview');
    placeSection('shop:popup', 'popup-1');
    core = start({
      parts: [],
      sections: [entry('shop:popup', reader('shop:remember', seen), { uses: ['store:shop:remember'] })],
      stores: pageStores([store('shop:remember', remember)]),
    });
    expect(seen).toEqual([true]);
    expect(window.localStorage.length).toBe(0);
  });
});
