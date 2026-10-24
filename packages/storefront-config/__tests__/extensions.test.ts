import { describe, expect, it } from 'vitest';
import { buildStorefrontConfig, type StorefrontConfigInput } from '../src/build';
import { extUseSchema, extensionStorefrontSchema, storefrontExtensionsSchema } from '../src/extensions';

// Сторы и методы расширений в конфиге страницы (блок 9 «Секций и SDK», часть 9в). Расширение — test-ext «Отзывы-тест».
const TEST_EXT = {
  stores: {
    summary: { fn: 'shopSummary', refreshOn: ['merfy:cart:add'] },
    rating: { fn: 'productRating', by: 'product' as const },
    myVotes: { fn: 'customerVotes', customer: true as const },
  },
  methods: {
    vote: { fn: 'voteReview', params: ['review-id'] },
    report: { fn: 'reportReview', customer: true as const },
  },
};

const input = (extensions?: StorefrontConfigInput['extensions']): StorefrontConfigInput => ({
  site: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', publicUrl: 'https://scarves.example' },
  theme: { id: 'nova', version: '0.0.4' },
  env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
  page: { id: 'home', path: '/' },
  mode: 'preview',
  ...(extensions === undefined ? {} : { extensions }),
});

describe('extensions в конфиге страницы', () => {
  it('описания расширений — в поле extensions как есть', () => {
    expect(buildStorefrontConfig(input({ 'test-ext': TEST_EXT })).extensions).toEqual({ 'test-ext': TEST_EXT });
  });

  it('нет описаний или пусто — поля нет: конфиг страницы без ctx.ext прежний', () => {
    expect('extensions' in buildStorefrontConfig(input())).toBe(false);
    expect('extensions' in buildStorefrontConfig(input({}))).toBe(false);
  });

  it.each<[string, unknown]>([
    ['id расширения с заглавной', { 'Test-ext': TEST_EXT }],
    ['имя стора с $', { 'test-ext': { ...TEST_EXT, stores: { $summary: { fn: 'shopSummary' } } } }],
    ['лишнее поле стора', { 'test-ext': { ...TEST_EXT, stores: { summary: { fn: 'shopSummary', cache: 60 } } } }],
    [
      'refreshOn — не событие витрины',
      { 'test-ext': { ...TEST_EXT, stores: { summary: { fn: 'shopSummary', refreshOn: ['cart.add'] } } } },
    ],
    [
      'params — не kebab-case',
      { 'test-ext': { ...TEST_EXT, methods: { vote: { fn: 'voteReview', params: ['reviewId'] } } } },
    ],
    ['нет methods', { 'test-ext': { stores: {} } }],
  ])('%s — ошибка схемы', (_title, extensions) => {
    expect(storefrontExtensionsSchema.safeParse(extensions).success).toBe(false);
  });

  it('сторов больше 20 — ошибка', () => {
    const stores = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`store${index}`, { fn: 'shopSummary' }]),
    );
    expect(extensionStorefrontSchema.safeParse({ stores, methods: {} }).success).toBe(false);
  });
});

// Те же строки проверяет storefront-sections/__tests__/ext-uses.test.ts: правило ext:<id> одно.
describe('ext:<id> в uses секции', () => {
  it.each(['ext:test-ext', 'ext:loyalty'])('%s — годится', (use) => {
    expect(extUseSchema.safeParse(use).success).toBe(true);
  });

  it.each(['test-ext', 'ext:Test', 'ext:ab', 'ext:', `ext:${'a'.repeat(33)}`])('%s — не годится', (use) => {
    expect(extUseSchema.safeParse(use).success).toBe(false);
  });
});
