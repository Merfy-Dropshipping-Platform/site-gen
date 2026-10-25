import { describe, expect, it } from 'vitest';
import { StorefrontConfigError } from '../src/errors';
import { checkStorefrontConfig, storefrontConfigSchema } from '../src/schema';
import { standConfig, withField } from './support';

// Ошибка проверки схемой. Схема ничего не бросила — тест падает с понятным текстом.
function problemOf(value: unknown): StorefrontConfigError {
  try {
    checkStorefrontConfig(value);
  } catch (error) {
    if (error instanceof StorefrontConfigError) return error;
    throw error;
  }
  throw new Error('конфиг прошёл схему, а не должен');
}

describe('схема конфига v1', () => {
  it('эталон стенда проходит схему', () => {
    expect(storefrontConfigSchema.safeParse(standConfig).success).toBe(true);
  });

  it.each<[string, string, unknown]>([
    ['v: 2', 'v', 2],
    ['mode: draft', 'mode', 'draft'],
    ['shop.id — не uuid', 'shop.id', 'site-1'],
    ['shop.id нет', 'shop.id', undefined],
    ['shop.name пустое', 'shop.name', ''],
    ['shop.name длиннее 200 знаков', 'shop.name', 'я'.repeat(201)],
    ['shop.url без https', 'shop.url', 'http://shop.example'],
    ['currency: USD', 'currency', 'USD'],
    ['locale: en-US', 'locale', 'en-US'],
    ['api.url не http', 'api.url', 'javascript:alert(1)//api'],
    ['theme.id с заглавной', 'theme.id', 'Nova'],
    ['theme.version не semver', 'theme.version', '1.0'],
    ['page.id с подчёркиванием', 'page.id', 'theme_stand'],
    ['page.path без «/»', 'page.path', 'theme-stand'],
  ])('%s — ошибка с путём поля', (_title, path, value) => {
    const error = problemOf(withField(path, value));
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe(path);
    expect(error.message.startsWith(`${path}: `)).toBe(true);
  });

  it('текст ошибки zod — по-русски', () => {
    expect(problemOf(withField('shop.id', 'site-1')).message).toBe('shop.id: Неверный UUID');
  });

  it('адрес API без /api — ошибка со своим текстом', () => {
    expect(problemOf(withField('api.url', 'https://gateway.merfy.ru')).message).toBe(
      'api.url: адрес API должен кончаться на /api',
    );
  });

  it('live без адреса магазина — ошибка shop.url', () => {
    expect(problemOf(withField('mode', 'live')).message).toBe('shop.url: у опубликованного магазина нужен адрес');
  });

  it('live с адресом https — годится', () => {
    const live = {
      ...withField('mode', 'live'),
      shop: { ...standConfig.shop, url: 'https://shop.merfy.ru' },
      analytics: { url: 'https://analytics.dev.merfy.ru', counters: [] },
    };
    expect(checkStorefrontConfig(live).shop.url).toBe('https://shop.merfy.ru');
  });

  it.each(['tenantId', 'shop.tenantId', 'api.tenantId', 'theme.tenantId', 'page.tenantId'])(
    'незнакомый ключ %s — ошибка, путь ведёт к ключу',
    (path) => {
      const error = problemOf(withField(path, 'org-1'));
      expect(error.path).toBe(path);
      expect(error.message).toBe(`${path}: Нераспознанный ключ: "tenantId"`);
    },
  );
});

const LIVE_ANALYTICS = { url: 'https://analytics.dev.merfy.ru', counters: [{ kind: 'metrika', number: '12345678' }] };

// Конфиг опубликованного магазина с этим полем analytics: адрес магазина есть, остальное — эталон стенда.
const liveWith = (analytics: unknown): Record<string, unknown> => ({
  ...standConfig,
  mode: 'live',
  shop: { ...standConfig.shop, url: 'https://shop.merfy.ru' },
  analytics,
});

describe('analytics в конфиге (design.md блока 11)', () => {
  it('у превью стенда — null; у опубликованного магазина — адрес сборщика и счётчики', () => {
    expect(standConfig.analytics).toBeNull();
    expect(checkStorefrontConfig(liveWith(LIVE_ANALYTICS)).analytics).toEqual(LIVE_ANALYTICS);
  });

  it.each<[string, unknown, string]>([
    ['live без analytics', null, 'analytics'],
    ['адрес с косой чертой в конце', { ...LIVE_ANALYTICS, url: 'https://analytics.dev.merfy.ru/' }, 'analytics.url'],
    ['адрес не http', { ...LIVE_ANALYTICS, url: 'ftp://analytics.dev.merfy.ru' }, 'analytics.url'],
    ['вид не из трёх', { ...LIVE_ANALYTICS, counters: [{ kind: 'meta', number: '1' }] }, 'analytics.counters.0.kind'],
    [
      'номер с кавычкой',
      { ...LIVE_ANALYTICS, counters: [{ kind: 'metrika', number: '1"' }] },
      'analytics.counters.0.number',
    ],
    [
      'лишнее поле счётчика',
      { ...LIVE_ANALYTICS, counters: [{ kind: 'vk', number: 'VK-RTRG-1-a', code: '<script>' }] },
      'analytics.counters.0.code',
    ],
  ])('%s — ошибка с путём поля', (_title, analytics, path) => {
    const error = problemOf(liveWith(analytics));
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe(path);
  });

  it('live без analytics — понятный текст', () => {
    expect(problemOf(liveWith(null)).message).toBe(
      'analytics: у опубликованного магазина нужен адрес сборщика аналитики',
    );
  });
});

// Блок 8 «Секций и SDK», часть 8б-2: страница записи — вид и id записи; у остальных страниц поля нет.
describe('page.record', () => {
  it('вид записи и непустой id — проходит; без поля — как раньше', () => {
    const record = { type: 'product', id: '00000000-0000-4000-8000-000000000101' };
    expect(checkStorefrontConfig(withField('page.record', record)).page.record).toEqual(record);
    expect(standConfig.page).not.toHaveProperty('record');
  });

  it.each<[string, string, unknown]>([
    ['вид не из списка', 'page.record.type', { type: 'page', id: 'p-1' }],
    ['пустой id', 'page.record.id', { type: 'product', id: '' }],
    ['лишний ключ', 'page.record.title', { type: 'product', id: 'p-1', title: 'Шарф' }],
  ])('%s — ошибка с путём поля', (_title, path, record) => {
    const error = problemOf(withField('page.record', record));
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe(path);
  });
});
