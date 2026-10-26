import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { defineSection } from '../src/core/define';
import { ext } from '../src/core/parts/ext';
import { start, type StartedCore } from '../src/core/start';
import type { Json, Mode, Result, SectionDef } from '../src/core/types';
import { entry, placeSection } from './core-support';
import { addressOf, fakeGateway, settle, storefrontConfig, type Answer } from './sdk-support';

// Блок 12, часть 12е (Р12е-1): ctx.ext шлёт токен покупательницы, как orders и auth. Расширение — test-ext.
const EXTENSIONS: NonNullable<StorefrontConfig['extensions']> = {
  'test-ext': { stores: { summary: { fn: 'shopSummary' } }, methods: { vote: { fn: 'voteReview' } } },
};
const FN = (fn: string): string => `POST /store/extensions/test-ext/fn/${fn}`;
const ok = (data: Json): Answer => ({ status: 200, body: { success: true, data } });
const TOKEN = 'token-12e';
let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function openPage(definition: SectionDef, mode: Mode = 'live'): void {
  const config = { ...storefrontConfig(mode), extensions: EXTENSIONS };
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
  placeSection('shop:reviews', 'reviews-1');
  core = start({ parts: [ext], sections: [entry('shop:reviews', definition, { uses: ['ext:test-ext'] })] });
}

// Заголовок authorization запросов к функциям расширения, по порядку; нет — null.
const authHeaders = (): (string | null)[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([input]) => addressOf(input).includes('/store/extensions/'))
    .map(([, init]) => new Headers(init?.headers).get('authorization'));

const voteOnMount = (box: { result: Result<Json> | null }): SectionDef =>
  defineSection({
    mount(_el, ctx) {
      void ctx.ext['test-ext'].vote({ reviewId: 'r-1' }).then((result) => {
        box.result = result;
      });
    },
  });

describe('ctx.ext: токен покупательницы', () => {
  it('метод: токен из localStorage — Authorization: Bearer, ответ прежний', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    fakeGateway().answer(FN('voteReview'), ok({ votes: 1 }));
    const box: { result: Result<Json> | null } = { result: null };
    openPage(voteOnMount(box));
    await settle();
    expect(box.result).toEqual({ ok: true, data: { votes: 1 } });
    expect(authHeaders()).toEqual([`Bearer ${TOKEN}`]);
  });

  it('стор: чтение тоже с токеном', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    fakeGateway().answer(FN('shopSummary'), ok({ reviews: 3 }));
    openPage(defineSection({ mount: (_el, ctx) => void ctx.watch(ctx.ext['test-ext'].$summary, () => undefined) }));
    await settle();
    expect(authHeaders()).toEqual([`Bearer ${TOKEN}`]);
  });

  it.each<[string, string | null, Mode]>([
    ['гость', null, 'live'],
    ['превью конструктора — токен браузера мерчанта не читается', TOKEN, 'preview'],
  ])('%s — заголовка нет', async (_name, token, mode) => {
    if (token !== null) localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    fakeGateway().answer(FN('voteReview'), ok({ votes: 1 }));
    openPage(voteOnMount({ result: null }), mode);
    await settle();
    expect(authHeaders()).toEqual([null]);
  });
});
