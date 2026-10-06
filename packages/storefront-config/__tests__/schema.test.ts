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
    const live = { ...withField('mode', 'live'), shop: { ...standConfig.shop, url: 'https://shop.merfy.ru' } };
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
