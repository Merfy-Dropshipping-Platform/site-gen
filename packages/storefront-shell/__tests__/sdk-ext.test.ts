import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { NOTICE_TEXT } from '../src/core/failures';
import { auth } from '../src/core/parts/auth';
import { ext } from '../src/core/parts/ext';
import { start, type StartedCore } from '../src/core/start';
import { atom, readable } from '../src/core/stores';
import type { AuthModule, CustomerState, Json, Result, SdkPart, SectionDef, SectionEntry } from '../src/core/types';
import { entry, placeSection, watchFailures } from './core-support';
import { API_URL, SHOP_ID, fakeGateway, field, settle, storefrontConfig, type Answer } from './sdk-support';

// ctx.ext (блок 9, часть 9в) на тестовом расширении «Отзывы-тест» (test-ext). Ядро не знает имён расширений: имена
// сторов и функций — только в конфиге страницы этого теста. Ответы шлюза — как у extension-fn.controller.ts.
const EXTENSIONS: NonNullable<StorefrontConfig['extensions']> = {
  'test-ext': {
    stores: {
      summary: { fn: 'shopSummary', refreshOn: ['merfy:cart:add'] },
      rating: { fn: 'productRating', by: 'product' },
      myVotes: { fn: 'customerVotes', customer: true },
    },
    methods: {
      vote: { fn: 'voteReview', params: ['review-id'] },
      report: { fn: 'reportReview', customer: true },
    },
  },
};
const FN = (fn: string): string => `POST /store/extensions/test-ext/fn/${fn}`;
const ok = (data: Json): Answer => ({ status: 200, body: { success: true, data } });
const coded = (status: number, code: string, message = 'Отзыв уже отмечен'): Answer => ({
  status,
  body: { success: false, code, message },
});

// Заглушка входа для ext-тестов: покупательница уже вошла; методы интерфейса 10в не вызываются.
const BUYER = { email: 'buyer@example.com', name: null, phone: null } as const;
const buyerOk = { ok: true as const, data: { customer: BUYER } };

const signedIn: SdkPart<'auth', AuthModule> = {
  name: 'auth',
  create: (): AuthModule => ({
    $customer: readable(atom<CustomerState>({ ready: true, customer: BUYER })),
    requestCode: () => Promise.resolve({ ok: true, data: {} }),
    verify: () => Promise.resolve(buyerOk),
    signout: () => Promise.resolve({ ok: true, data: {} }),
    updateProfile: () => Promise.resolve(buyerOk),
  }),
};

let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

interface PageOptions {
  readonly uses?: SectionEntry['uses'];
  readonly html?: string;
  readonly parts?: readonly SdkPart<string, unknown>[];
}

// Страница с секцией «Отзывы» магазина: конфиг с описаниями test-ext, части auth и ext.
function openPage(definition: SectionDef, options: PageOptions = {}): void {
  const config = { ...storefrontConfig('preview'), extensions: EXTENSIONS };
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
  placeSection('shop:reviews', 'reviews-1', options.html ?? '');
  const uses = options.uses ?? ['ext:test-ext'];
  core = start({ parts: options.parts ?? [auth, ext], sections: [entry('shop:reviews', definition, { uses })] });
}

const extCalls = (gateway: ReturnType<typeof fakeGateway>) =>
  gateway.calls.filter((call) => call.key.startsWith('POST /store/extensions/'));

function notices() {
  const shown: unknown[] = [];
  document.addEventListener('merfy:notice:show', (event) => {
    shown.push(event instanceof CustomEvent ? event.detail : null);
  });
  return shown;
}

describe('сторы расширения', () => {
  it('без подписки — запроса нет, get() — null', async () => {
    const gateway = fakeGateway();
    const seen: (Json | null)[] = [];
    openPage(defineSection({ mount: (_el, ctx) => void seen.push(ctx.ext['test-ext'].$summary.get()) }));
    await settle();
    expect(seen).toEqual([null]);
    expect(extCalls(gateway)).toEqual([]);
  });

  it('ctx.watch — один запрос с store_id магазина; до ответа null, потом ответ; две подписки — один запрос', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('shopSummary'), ok({ reviews: 3 }));
    const seen: (Json | null)[] = [];
    openPage(
      defineSection({
        mount(_el, ctx) {
          ctx.watch(ctx.ext['test-ext'].$summary, (value) => seen.push(value));
          ctx.watch(ctx.ext['test-ext'].$summary, () => undefined);
        },
      }),
    );
    await settle();
    expect(seen).toEqual([null, { reviews: 3 }]);
    expect(extCalls(gateway)).toEqual([{ key: FN('shopSummary'), body: {} }]);
    expect(vi.mocked(fetch).mock.calls.map(([input]) => input)).toContain(
      `${API_URL}/store/extensions/test-ext/fn/shopSummary?store_id=${SHOP_ID}`,
    );
  });

  it('стор на товар: id при запуске секции — одним вызовом, без повторов; товара нет в ответе — null', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('productRating'), ok({ p1: { stars: 4.5, count: 12 } }));
    const seen: Record<string, Json | null> = {};
    openPage(
      defineSection({
        mount(_el, ctx) {
          const rating = ctx.ext['test-ext'].$rating;
          ctx.watch(rating('p1'), (value) => (seen.p1 = value));
          ctx.watch(rating('p2'), (value) => (seen.p2 = value));
          ctx.watch(rating('p1'), (value) => (seen.again = value));
        },
      }),
    );
    await settle();
    expect(extCalls(gateway)).toEqual([{ key: FN('productRating'), body: { productIds: ['p1', 'p2'] } }]);
    expect(seen).toEqual({ p1: { stars: 4.5, count: 12 }, p2: null, again: { stars: 4.5, count: 12 } });
  });

  it('больше 100 товаров — вызовы по 100', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('productRating'), ok({}), ok({}));
    openPage(
      defineSection({
        mount(_el, ctx) {
          for (let index = 1; index <= 101; index += 1)
            ctx.watch(ctx.ext['test-ext'].$rating(`p${index}`), () => undefined);
        },
      }),
    );
    await settle();
    const sizes = extCalls(gateway).map((call) => {
      const ids = field(call.body, 'productIds');
      return Array.isArray(ids) ? ids.length : -1;
    });
    expect(sizes).toEqual([100, 1]);
  });

  it('customer: true у гостя — null без запроса; вошедший покупатель — запрос', async () => {
    const guest = fakeGateway();
    const seen: (Json | null)[] = [];
    const watchVotes = defineSection({
      mount: (_el, ctx) => void ctx.watch(ctx.ext['test-ext'].$myVotes, (value) => seen.push(value)),
    });
    openPage(watchVotes);
    await settle();
    expect(seen).toEqual([null]);
    expect(extCalls(guest)).toEqual([]);
    core?.stop();
    document.body.replaceChildren();
    const buyer = fakeGateway();
    buyer.answer(FN('customerVotes'), ok({ votes: 2 }));
    openPage(watchVotes, { parts: [signedIn, ext] });
    await settle();
    expect(extCalls(buyer).map((call) => call.key)).toEqual([FN('customerVotes')]);
  });

  it('refreshOn: merfy:cart:add на document — стор читается заново', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('shopSummary'), ok({ reviews: 3 }), ok({ reviews: 4 }));
    const seen: (Json | null)[] = [];
    openPage(defineSection({ mount: (_el, ctx) => void ctx.watch(ctx.ext['test-ext'].$summary, (v) => seen.push(v)) }));
    await settle();
    document.dispatchEvent(new CustomEvent('merfy:cart:add', { detail: {} }));
    await settle();
    expect(seen).toEqual([null, { reviews: 3 }, { reviews: 4 }]);
  });

  it('чтение не удалось — значение прежнее, уведомления нет', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('shopSummary'), coded(502, 'invalid_output', 'extension function returned an invalid response'));
    const shown = notices();
    const seen: (Json | null)[] = [];
    openPage(defineSection({ mount: (_el, ctx) => void ctx.watch(ctx.ext['test-ext'].$summary, (v) => seen.push(v)) }));
    await settle();
    expect(seen).toEqual([null]);
    expect(shown).toEqual([]);
  });

  it('обычный стор с id товара — сбой mount sdk-call-invalid; стор на товар в ctx.watch без id — тоже', async () => {
    fakeGateway();
    const failures = watchFailures();
    openPage(defineSection({ mount: (_el, ctx) => void ctx.ext['test-ext'].$summary('p1') }));
    await settle();
    core?.stop();
    document.body.replaceChildren();
    openPage(defineSection({ mount: (_el, ctx) => void ctx.watch(ctx.ext['test-ext'].$rating, () => undefined) }));
    await settle();
    expect(failures.details.map((detail) => detail.stage)).toEqual(['mount', 'mount']);
    expect(failures.details[0]?.message).toContain('не на товар');
    expect(failures.details[1]?.message).toContain('ctx.watch');
    failures.stop();
  });
});

describe('методы расширения', () => {
  // Метод из mount секции: ответ — в results; сторы — подписаны до вызова.
  function callMethod(name: 'vote' | 'report', input?: Readonly<Record<string, Json>>, quiet = false): Result<Json>[] {
    const results: Result<Json>[] = [];
    openPage(
      defineSection({
        mount(_el, ctx) {
          const method = ctx.ext['test-ext'][name];
          void method(input, { quiet }).then((result) => results.push(result));
        },
      }),
    );
    return results;
  }

  it('ответ — data; подписанные сторы расширения перечитаны до ответа', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('shopSummary'), ok({ reviews: 3 }), ok({ reviews: 4 }));
    gateway.answer(FN('voteReview'), ok({ votes: 1 }));
    const box: { result: Result<Json> | null; summary: Json | null } = { result: null, summary: null };
    openPage(
      defineSection({
        mount(_el, ctx) {
          const reviews = ctx.ext['test-ext'];
          ctx.watch(reviews.$summary, () => undefined);
          void reviews.vote({ reviewId: 'r-1' }).then((result) => {
            box.result = result;
            box.summary = reviews.$summary.get();
          });
        },
      }),
    );
    await settle();
    expect(box).toEqual({ result: { ok: true, data: { votes: 1 } }, summary: { reviews: 4 } });
    expect(extCalls(gateway).find((call) => call.key === FN('voteReview'))?.body).toEqual({ reviewId: 'r-1' });
  });

  it('ответ 201 на POST метода — успех: шлюз отвечает 201, а не 200 (секция «Заявка» 12д)', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('voteReview'), { status: 201, body: { success: true, data: { votes: 2 } } });
    const results = callMethod('vote', { reviewId: 'r-2' });
    await settle();
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual(['ok']);
  });

  it.each<[number, string, string, string | null]>([
    [422, 'refused', 'refused', 'Отзыв уже отмечен'],
    [502, 'invalid_output', 'server', NOTICE_TEXT.server],
    [502, 'fn_error', 'server', NOTICE_TEXT.server],
    [503, 'unavailable', 'server', NOTICE_TEXT.server],
    [401, 'unauthorized', 'unauthorized', NOTICE_TEXT.unauthorized],
    [404, 'not_found', 'invalid', null],
    [403, 'forbidden', 'invalid', null],
    [400, 'invalid_input', 'invalid', null],
  ])('шлюз %i %s — код %s, уведомление %s', async (status, serverCode, code, notice) => {
    const gateway = fakeGateway();
    gateway.answer(FN('voteReview'), coded(status, serverCode));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const shown = notices();
    const results = callMethod('vote', { reviewId: 'r-1' });
    await settle();
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual([code]);
    expect(shown.map((detail) => field(detail, 'message'))).toEqual(notice === null ? [] : [notice]);
    expect(consoleError.mock.calls.length > 0).toBe(code === 'invalid');
  });

  it('429 без кода — limit; обрыв — network', async () => {
    const gateway = fakeGateway();
    gateway.answer(
      FN('voteReview'),
      { status: 429, body: { statusCode: 429, message: 'ThrottlerException' } },
      'network',
    );
    const results = callMethod('vote', { reviewId: 'r-1' });
    await settle();
    core?.stop();
    document.body.replaceChildren();
    const second = callMethod('vote', { reviewId: 'r-2' });
    await settle();
    expect([...results, ...second].map((result) => (result.ok ? 'ok' : result.error.code))).toEqual([
      'limit',
      'network',
    ]);
  });

  it('customer: true у гостя — unauthorized без запроса', async () => {
    const gateway = fakeGateway();
    const results = callMethod('report', { reviewId: 'r-1' });
    await settle();
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual(['unauthorized']);
    expect(extCalls(gateway)).toEqual([]);
  });

  it('quiet — без уведомления, ответ тот же', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('voteReview'), coded(502, 'fn_error'));
    const shown = notices();
    const results = callMethod('vote', { reviewId: 'r-1' }, true);
    await settle();
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual(['server']);
    expect(shown).toEqual([]);
  });

  it('аргументы не объект — invalid без запроса, строка в консоли', async () => {
    const gateway = fakeGateway();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const box: { result: unknown } = { result: null };
    openPage(
      defineSection({
        mount(_el, ctx) {
          const vote = ctx.ext['test-ext'].vote;
          void Promise.resolve(Reflect.apply(vote, undefined, ['r-1'])).then(
            (result: unknown) => (box.result = result),
          );
        },
      }),
    );
    await settle();
    expect(field(field(box.result, 'error'), 'code')).toBe('invalid');
    expect(extCalls(gateway)).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it('data-action="ext.test-ext.vote" — тот же метод, аргументы из data-* по params', async () => {
    const gateway = fakeGateway();
    gateway.answer(FN('voteReview'), ok({ votes: 2 }));
    openPage(defineSection({}), {
      html: '<button type="button" data-action="ext.test-ext.vote" data-review-id="r-2">Полезно</button>',
    });
    document.querySelector('button')?.click();
    await settle();
    expect(extCalls(gateway)).toEqual([{ key: FN('voteReview'), body: { reviewId: 'r-2' } }]);
  });
});

describe('ctx.ext в секции', () => {
  it('без ext в uses — пустой объект', async () => {
    fakeGateway();
    const keys: string[][] = [];
    openPage(defineSection({ mount: (_el, ctx) => void keys.push(Object.keys(ctx.ext)) }), { uses: [] });
    await settle();
    expect(keys).toEqual([[]]);
  });

  it('ctx.ext и модуль — замороженные объекты со своими полями: ключ-выражение кода секции их читает (Р9в-24)', async () => {
    fakeGateway();
    const seen: boolean[] = [];
    const names = ['$summary', '$rating', '$myVotes', 'vote', 'report'];
    openPage(
      defineSection({
        mount(_el, ctx) {
          const module = ctx.ext['test-ext'];
          seen.push(Object.isFrozen(ctx.ext), Object.hasOwn(ctx.ext, 'test-ext'), Object.isFrozen(module));
          seen.push(names.every((name) => Object.hasOwn(module, name)));
        },
      }),
    );
    await settle();
    expect(seen).toEqual([true, true, true, true]);
  });

  it('расширения нет в конфиге страницы — сбой mount part-unknown, код секции не вызван', async () => {
    fakeGateway();
    const failures = watchFailures();
    const mounted: string[] = [];
    openPage(defineSection({ mount: () => void mounted.push('mount') }), { uses: ['ext:loyalty'] });
    await settle();
    expect(mounted).toEqual([]);
    expect(failures.details.map((detail) => [detail.stage, detail.message])).toEqual([
      ['mount', 'расширения loyalty на странице нет'],
    ]);
    failures.stop();
  });

  it('части ext на странице нет — тоже part-unknown', async () => {
    fakeGateway();
    const failures = watchFailures();
    openPage(defineSection({ mount: () => undefined }), { parts: [auth] });
    await settle();
    expect(failures.details.map((detail) => detail.stage)).toEqual(['mount']);
    failures.stop();
  });
});
