import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { ext } from '../src/core/parts/ext';
import { start, type StartedCore } from '../src/core/start';
import type { Json, SectionDef } from '../src/core/types';
import { entry, placeSection } from './core-support';
import { fakeGateway, settle, storefrontConfig, type Answer } from './sdk-support';

// Начальные значения сторов расширения из HTML (prerender): тег data-merfy-ext рядом с входными данными секции. Первый
// watch идёт без запроса, потом одно перечитывание после загрузки страницы; прочитанное то же — подписчики не зовутся.
// Расширение тестовое (test-ext): ядро имён расширений не знает.
const EXTENSIONS: NonNullable<StorefrontConfig['extensions']> = {
  'test-ext': {
    stores: {
      card: { fn: 'itemCard', by: 'record', record: 'item' },
      rating: { fn: 'productRating', by: 'product' },
      mine: { fn: 'myCard', by: 'record', record: 'item', customer: true },
    },
    methods: {},
  },
};
const FN = (fn: string): string => `POST /store/extensions/test-ext/fn/${fn}`;
const ok = (data: Json): Answer => ({ status: 200, body: { success: true, data } });
const NAME = 'shop:card';
const CARD = { title: 'Тёплые вещи' };

let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'readyState');
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const seedTag = (tree: Json): string =>
  `<script type="application/json" data-merfy-ext>${JSON.stringify(tree)}</script>`;
const seeds = (stores: Json): string => seedTag({ 'test-ext': stores });

// Секция следит за карточкой записи r1; seen — все значения, которые она получила.
function open(html: string, kind: 'card' | 'rating' | 'mine' = 'card'): (Json | null)[] {
  const config = { ...storefrontConfig('live'), extensions: EXTENSIONS };
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
  placeSection(NAME, 'card-1', html);
  const seen: (Json | null)[] = [];
  const definition: SectionDef = defineSection({
    mount(_el, ctx) {
      const store = ctx.ext['test-ext'];
      const source = { card: store.$card('r1'), rating: store.$rating('r1'), mine: store.$mine('r1') }[kind];
      ctx.watch(source, (value) => seen.push(value));
    },
  });
  core = start({ parts: [ext], sections: [entry(NAME, definition, { uses: ['ext:test-ext'] })] });
  return seen;
}

const calls = (gateway: ReturnType<typeof fakeGateway>) =>
  gateway.calls.filter((call) => call.key.startsWith('POST /store/extensions/'));

describe('начальное значение стора из HTML', () => {
  it('первый watch получает значение из тега сразу и без запроса; перечитывание после загрузки — один вызов', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    const seen = open(seeds({ card: { r1: CARD } }));
    expect(seen).toEqual([CARD]);
    expect(calls(gateway)).toEqual([]);

    await settle();

    expect(calls(gateway)).toEqual([{ key: FN('itemCard'), body: { recordIds: ['r1'] } }]);
    expect(seen).toEqual([CARD]);
  });

  it('перечитанное значение другое — подписчик получает новое', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: { title: 'Другое' } }));
    const seen = open(seeds({ card: { r1: CARD } }));

    await settle();

    expect(seen).toEqual([CARD, { title: 'Другое' }]);
  });

  it('запись исчезла у расширения — после перечитывания null', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({}));
    const seen = open(seeds({ card: { r1: CARD } }));

    await settle();

    expect(seen).toEqual([CARD, null]);
  });

  it('до загрузки страницы запроса нет, после события load — один', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    open(seeds({ card: { r1: CARD } }));

    await settle();
    expect(calls(gateway)).toEqual([]);

    window.dispatchEvent(new Event('load'));
    await settle();
    expect(calls(gateway)).toHaveLength(1);
  });

  it('тега нет — запрос при первом watch, как раньше', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    const seen = open('');

    expect(seen).toEqual([null]);
    await settle();

    expect(seen).toEqual([null, CARD]);
    expect(calls(gateway)).toHaveLength(1);
  });

  it('битый тег — строка в консоли, значение читается запросом', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen = open('<script type="application/json" data-merfy-ext>{не json</script>');

    await settle();

    expect(errors.mock.calls.flat().join(' ')).toContain('data-merfy-ext');
    expect(seen).toEqual([null, CARD]);
  });

  it.each<[string, 'rating' | 'mine' | 'card', Json]>([
    ['стор не на запись', 'rating', { rating: { r1: CARD } }],
    ['стор покупательницы', 'mine', { mine: { r1: CARD } }],
    ['стора нет в манифесте', 'card', { missing: { r1: CARD } }],
    ['id не по правилу', 'card', { card: { 'r 1': CARD } }],
  ])('%s — тег не принимается', async (_title, kind, stores) => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    gateway.answer(FN('productRating'), ok({ r1: CARD }));
    gateway.answer(FN('myCard'), ok({ r1: CARD }));
    const seen = open(seeds(stores), kind);

    expect(seen).toEqual([null]);
    await settle();
    expect(calls(gateway).length).toBeLessThanOrEqual(1);
    expect(seen.at(0)).toBeNull();
  });

  it('тег чужого расширения не принимается', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok({ r1: CARD }));
    const seen = open(seedTag({ 'other-ext': { card: { r1: CARD } } }));

    expect(seen).toEqual([null]);
    await settle();
    expect(seen).toEqual([null, CARD]);
  });
});
