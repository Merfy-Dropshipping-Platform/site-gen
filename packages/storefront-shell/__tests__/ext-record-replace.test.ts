import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { ext } from '../src/core/parts/ext';
import {
  PREVIEW_REPLACE_EVENT,
  PREVIEW_STORES_EVENT,
  type PreviewReplaceDetail,
} from '../src/core/preview-protocol';
import { watchPreviewReplace } from '../src/core/replace';
import { start, type StartedCore } from '../src/core/start';
import type { Json, Mode } from '../src/core/types';
import { entry, hash, placeSection } from './core-support';
import { fakeGateway, settle, storefrontConfig, type Answer } from './sdk-support';

// Сторы расширения, когда рамка превью меняет значения, которые подставляет вместо ответов сервера (сообщение
// ext-store-values кабинета → событие PREVIEW_STORES_EVENT скрипта секций превью). Стор по записи, по товару и обычный
// держат прочитанное значение, пока на них кто-то подписан; без перечитывания секция, которую заменили, показывала бы
// старое. Расширение тестовое (test-ext): ядро имён расширений не знает.
const EXTENSIONS: NonNullable<StorefrontConfig['extensions']> = {
  'test-ext': {
    stores: {
      card: { fn: 'itemCard', by: 'record', record: 'item' },
      rating: { fn: 'productRating', by: 'product' },
      summary: { fn: 'shopSummary' },
    },
    methods: {},
  },
};
const FN = (fn: string): string => `POST /store/extensions/test-ext/fn/${fn}`;
const ok = (data: Json): Answer => ({ status: 200, body: { success: true, data } });
const NAME = 'shop:card';
const ID = 'preview-section';
const HTML = `<merfy-section data-section="${NAME}" data-section-id="${ID}"><p data-ref="title"></p></merfy-section>`;

type Kind = 'card' | 'rating' | 'summary';

let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const titleOf = (value: Json | null): string => {
  const title: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'title') : null;
  return typeof title === 'string' ? title : '—';
};

// Секция показывает title стора вида kind: запись r-1, товар p-1 или стор магазина.
function open(kind: Kind, mode: Mode = 'preview'): void {
  const config = { ...storefrontConfig(mode), extensions: EXTENSIONS };
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
  placeSection(NAME, ID, '<p data-ref="title"></p>');
  const definition = defineSection({
    mount(_el, ctx) {
      const store = ctx.ext['test-ext'];
      const source = { card: store.$card('r-1'), rating: store.$rating('p-1'), summary: store.$summary }[kind];
      ctx.watch(source, (value) => ctx.ref('title')?.text(titleOf(value)));
    },
  });
  core = start({
    parts: [ext],
    sections: [entry(NAME, definition, { uses: ['ext:test-ext'] })],
    preview: watchPreviewReplace,
  });
}

// Замена секции, как её отправляет скрипт превью: тот же HTML, тот же код.
function replace(): Promise<string> {
  const target = document.querySelector(`merfy-section[data-section-id="${ID}"]`);
  if (target === null) throw new Error('нет секции');
  return new Promise((resolve) => {
    const detail: PreviewReplaceDetail = {
      html: HTML,
      script: { hash: hash('a'), uses: ['ext:test-ext'] },
      codeOnly: false,
      load: () => Promise.reject(new Error('код не загружали')),
      reply: (outcome) => resolve(outcome),
    };
    target.dispatchEvent(new CustomEvent(PREVIEW_REPLACE_EVENT, { bubbles: true, cancelable: true, detail }));
  });
}

const changed = async (): Promise<void> => {
  document.dispatchEvent(new CustomEvent(PREVIEW_STORES_EVENT));
  await settle();
};
const shown = (): string | null | undefined => document.querySelector('[data-ref="title"]')?.textContent;

const SERVER: Record<Kind, [Json, Json]> = {
  card: [{ 'r-1': { title: 'Было' } }, { 'r-1': { title: 'Стало' } }],
  rating: [{ 'p-1': { title: 'Было' } }, { 'p-1': { title: 'Стало' } }],
  summary: [{ title: 'Было' }, { title: 'Стало' }],
};
const FUNCTION: Record<Kind, string> = { card: 'itemCard', rating: 'productRating', summary: 'shopSummary' };

describe('сторы расширения: рамка превью сменила подставленные значения', () => {
  it.each<Kind>(['card', 'rating', 'summary'])('стор %s: секция, на которую он подписан, показывает новое значение', async (kind) => {
    const gateway = fakeGateway();
    gateway.answer(FN(FUNCTION[kind]), ok(SERVER[kind][0]), ok(SERVER[kind][1]));
    open(kind);
    await settle();
    expect(shown()).toBe('Было');

    await changed();

    expect(shown()).toBe('Стало');
    expect(gateway.calls).toHaveLength(2);
  });

  it('заменённая секция с той же записью получает значение, прочитанное после смены', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok(SERVER.card[0]), ok(SERVER.card[1]));
    open('card');
    await settle();

    await changed();
    expect(await replace()).toBe('fresh');
    await settle();

    expect(shown()).toBe('Стало');
    expect(gateway.calls.map((call) => call.body)).toEqual([{ recordIds: ['r-1'] }, { recordIds: ['r-1'] }]);
  });

  it('никто не подписан — запроса нет', async () => {
    const gateway = fakeGateway();
    open('card');
    document.querySelector('merfy-section')?.remove();
    await settle();
    gateway.calls.length = 0;

    await changed();

    expect(gateway.calls).toEqual([]);
  });

  it('на опубликованном сайте события нет: стор не перечитывается', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('itemCard'), ok(SERVER.card[0]), ok(SERVER.card[1]));
    open('card', 'live');
    await settle();

    await changed();

    expect(shown()).toBe('Было');
    expect(gateway.calls).toHaveLength(1);
  });
});
