import { describe, expect, it } from 'vitest';
import { checkShopPages, type PageCheckDeps } from '../../src/release/page-check';

const SHOP = 'https://uzelok.dev.merfy.ru';
const config = (version: string): string =>
  `<script type="application/json" id="merfy-config">{"theme":{"id":"nova","version":"${version}"}}</script>`;
const page = (version: string, tokens = ':root{--radius-button:12px}'): string =>
  [
    '<!doctype html><html lang="ru-RU"><head>',
    config(version),
    `<style id="merfy-tokens">${tokens}</style>`,
    '<link rel="stylesheet" href="/_astro/shop.css">',
    '<script type="importmap">{"imports":{"@merfy/shell":"/_merfy/shell/abc/shell.js"}}</script>',
    '<script type="module" src="/_astro/page.js"></script>',
    '<link rel="preconnect" href="https://cdn.example.com">',
    '</head><body></body></html>',
  ].join('');

type Answer = { status: number; body?: string };

// Подставной fetch: адрес → ответы по очереди (последний повторяется).
function fakeFetch(answers: Record<string, Answer[]>): PageCheckDeps['fetch'] {
  return (input) => {
    const queue = answers[String(input)] ?? [{ status: 404 }];
    const answer = queue.length > 1 ? (queue.shift() ?? queue[0]) : queue[0];
    return Promise.resolve(new Response(answer.body ?? '', { status: answer.status }));
  };
}

const files = (status: number): Record<string, Answer[]> => ({
  [`${SHOP}/_astro/shop.css`]: [{ status }],
  [`${SHOP}/_merfy/shell/abc/shell.js`]: [{ status: 200 }],
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
      { version: '0.2.0' },
    );
    expect(result).toEqual({ ok: true, problems: [], files: 3 });
  });

  it('файла стилей нет в хранилище — поломка', async () => {
    const result = await checkShopPages(
      deps({ [`${SHOP}/`]: [{ status: 200, body: page('0.2.0') }], ...files(503) }),
      SHOP,
      { version: '0.2.0' },
    );
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['/_astro/shop.css ответил 503']);
  });

  it('раздача ещё отдаёт старую версию — ждём; так и не стала новой — поломка', async () => {
    const late = [
      { status: 200, body: page('0.1.2') },
      { status: 200, body: page('0.2.0') },
    ];
    expect((await checkShopPages(deps({ [`${SHOP}/`]: late, ...files(200) }), SHOP, { version: '0.2.0' })).ok).toBe(
      true,
    );
    const stuck = [{ status: 200, body: page('0.1.2') }];
    const result = await checkShopPages(deps({ [`${SHOP}/`]: stuck, ...files(200) }), SHOP, { version: '0.2.0' });
    expect(result.problems).toEqual(['в конфиге страницы версия темы 0.1.2, ждали 0.2.0']);
  });

  it('CSS токенов пустой — поломка', async () => {
    const answers = { [`${SHOP}/`]: [{ status: 200, body: page('0.2.0', '') }], ...files(200) };
    expect((await checkShopPages(deps(answers), SHOP, { version: '0.2.0' })).problems).toEqual(['CSS токенов пустой']);
  });

  it('главная не 200 — поломка, файлы не спрашиваем', async () => {
    const result = await checkShopPages(deps({ [`${SHOP}/`]: [{ status: 503 }] }), SHOP, { version: '0.2.0' });
    expect(result).toEqual({ ok: false, problems: ['главная ответила 503'], files: 0 });
  });

  it('версию не ждём (выпуск платформы) — её не сравниваем', async () => {
    const result = await checkShopPages(
      deps({ [`${SHOP}/`]: [{ status: 200, body: page('0.1.2') }], ...files(200) }),
      SHOP,
      { version: null },
    );
    expect(result.ok).toBe(true);
  });
});
