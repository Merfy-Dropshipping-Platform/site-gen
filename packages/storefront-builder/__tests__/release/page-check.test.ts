import { describe, expect, it } from 'vitest';
import { checkShopPages, type PageCheckDeps } from '../../src/release/page-check';

const SHOP = 'https://uzelok.dev.merfy.ru';
const config = (version: string): string =>
  `<script type="application/json" id="merfy-config">{"theme":{"id":"nova","version":"${version}"}}</script>`;
const page = (version: string, tokens = ':root{--radius-button:12px}', bundle = 'a'.repeat(64)): string =>
  [
    '<!doctype html><html lang="ru-RU"><head>',
    config(version),
    `<style id="merfy-tokens">${tokens}</style>`,
    '<link rel="stylesheet" href="/_astro/shop.css">',
    `<script type="module" src="/_merfy/b/${bundle}.js"></script>`,
    '<script type="module" src="/_astro/page.js"></script>',
    '<link rel="preconnect" href="https://cdn.example.com">',
    '</head><body></body></html>',
  ].join('');

type Answer = { status: number; body?: string; etag?: string };

// Подставной fetch: адрес → ответы по очереди (последний повторяется).
function fakeFetch(answers: Record<string, Answer[]>): PageCheckDeps['fetch'] {
  return (input) => {
    const queue = answers[String(input)] ?? [{ status: 404 }];
    const answer = queue.length > 1 ? (queue.shift() ?? queue[0]) : queue[0];
    const headers: Record<string, string> = answer.etag === undefined ? {} : { ETag: `"${answer.etag}"` };
    return Promise.resolve(new Response(answer.body ?? '', { status: answer.status, headers }));
  };
}

const files = (status: number): Record<string, Answer[]> => ({
  [`${SHOP}/_astro/shop.css`]: [{ status }],
  [`${SHOP}/_merfy/b/${'a'.repeat(64)}.js`]: [{ status: 200 }],
  [`${SHOP}/_astro/page.js`]: [{ status: 200 }],
});

const deps = (answers: Record<string, Answer[]>): PageCheckDeps => ({
  fetch: fakeFetch(answers),
  attempts: 3,
  delayMs: 0,
});

describe('проверка страниц без браузера (design.md блока 10, П10-3 Б)', () => {
  it('всё на месте — чисто, файлов того же адреса три', async () => {
    const result = await checkShopPages(
      deps({ [`${SHOP}/`]: [{ status: 200, body: page('0.2.0') }], ...files(200) }),
      SHOP,
      { version: '0.2.0', home: null },
    );
    expect(result).toEqual({ ok: true, problems: [], files: 3 });
  });

  it('файла стилей нет в хранилище — поломка', async () => {
    const result = await checkShopPages(
      deps({ [`${SHOP}/`]: [{ status: 200, body: page('0.2.0') }], ...files(503) }),
      SHOP,
      { version: '0.2.0', home: null },
    );
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['/_astro/shop.css ответил 503']);
  });

  it('раздача ещё отдаёт старую версию — ждём; так и не стала новой — поломка', async () => {
    const late = [
      { status: 200, body: page('0.1.2') },
      { status: 200, body: page('0.2.0') },
    ];
    expect((await checkShopPages(deps({ [`${SHOP}/`]: late, ...files(200) }), SHOP, { version: '0.2.0', home: null })).ok).toBe(
      true,
    );
    const stuck = [{ status: 200, body: page('0.1.2') }];
    const result = await checkShopPages(deps({ [`${SHOP}/`]: stuck, ...files(200) }), SHOP, { version: '0.2.0', home: null });
    expect(result.problems).toEqual(['в конфиге страницы версия темы 0.1.2, ждали 0.2.0']);
  });

  it('CSS токенов пустой — поломка', async () => {
    const answers = { [`${SHOP}/`]: [{ status: 200, body: page('0.2.0', '') }], ...files(200) };
    expect((await checkShopPages(deps(answers), SHOP, { version: '0.2.0', home: null })).problems).toEqual(['CSS токенов пустой']);
  });

  it('главная не 200 — поломка, файлы не спрашиваем', async () => {
    const result = await checkShopPages(deps({ [`${SHOP}/`]: [{ status: 503 }] }), SHOP, { version: '0.2.0', home: null });
    expect(result).toEqual({ ok: false, problems: ['главная ответила 503'], files: 0 });
  });

  it('версию не ждём (выпуск платформы) — её не сравниваем', async () => {
    const result = await checkShopPages(
      deps({ [`${SHOP}/`]: [{ status: 200, body: page('0.1.2') }], ...files(200) }),
      SHOP,
      { version: null, home: null },
    );
    expect(result.ok).toBe(true);
  });
});

// Гонка раздачи выпуска платформы №77 (26.10): указатель кэшируется ~1 с, проверка «после» успевала снять паспорт со
// старого HTML — его бандла уже нет в новой таблице раздачи, 404 объявлялся «новой ошибкой в консоли» и красным.
// Признак новой сборки — ETag главной: раздача отдаёт отпечаток файла, манифест живой сборки знает ожидаемый.
describe('главная ждёт новую сборку по ETag (гонка раздачи, выпуск №77)', () => {
  const OLD_BUNDLE = 'c'.repeat(64);
  const NEW_BUNDLE = 'd'.repeat(64);
  const OLD_HOME = '1'.repeat(64);
  const NEW_HOME = '2'.repeat(64);

  const answersOf = (home: Answer[]): Record<string, Answer[]> => ({
    [`${SHOP}/`]: home,
    [`${SHOP}/_astro/shop.css`]: [{ status: 200 }],
    // Бандл старой сборки в новой таблице раздачи уже отсутствует — 404; новый на месте.
    [`${SHOP}/_merfy/b/${OLD_BUNDLE}.js`]: [{ status: 404 }],
    [`${SHOP}/_merfy/b/${NEW_BUNDLE}.js`]: [{ status: 200 }],
    [`${SHOP}/_astro/page.js`]: [{ status: 200 }],
  });

  it('первые открытия отдают старый HTML с бандлом, которого нет в новой таблице, — ждём новую сборку, всё чисто', async () => {
    const home: Answer[] = [
      { status: 200, body: page('0.6.0', undefined, OLD_BUNDLE), etag: OLD_HOME },
      { status: 200, body: page('0.6.0', undefined, OLD_BUNDLE), etag: OLD_HOME },
      { status: 200, body: page('0.6.0', undefined, NEW_BUNDLE), etag: NEW_HOME },
    ];
    const result = await checkShopPages(deps(answersOf(home)), SHOP, { version: null, home: NEW_HOME });
    expect(result).toEqual({ ok: true, problems: [], files: 3 });
  });

  it('новая сборка так и не пришла — понятная поломка ожидания, а не «бандл ответил 404»', async () => {
    const home: Answer[] = [{ status: 200, body: page('0.6.0', undefined, OLD_BUNDLE), etag: OLD_HOME }];
    const result = await checkShopPages(deps(answersOf(home)), SHOP, { version: null, home: NEW_HOME });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      `раздача не сменила главную на новую сборку: ETag "${OLD_HOME}", ждали "${NEW_HOME}"`,
    ]);
  });

  it('отпечатка в ответе нет — та же поломка ожидания', async () => {
    const home: Answer[] = [{ status: 200, body: page('0.6.0', undefined, OLD_BUNDLE) }];
    const result = await checkShopPages(deps(answersOf(home)), SHOP, { version: null, home: NEW_HOME });
    expect(result.problems).toEqual([`раздача не сменила главную на новую сборку: ETag нет, ждали "${NEW_HOME}"`]);
  });
});
