import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import buyerJson from '../fixtures/buyer.json';
import productsJson from '../fixtures/products.json';
import routesJson from '../mocks/routes.json';
import { parseWith } from '../src/errors';
import { buyerReplySchema, productsReplySchema } from '../src/mocks/fixtures';
import { mockReplyOf, parseMockRoutes } from '../src/mocks/routes';
import { packagePath } from '../src/paths';
import { SCHEMA_FILES } from '../src/schema-files';

const TABLE = parseMockRoutes(routesJson);
const readText = (file: string): string => readFileSync(packagePath(file), 'utf8');
const schemaFileOf = (file: string): string => file.replace(/\.json$/, '.schema.json');

// Схема файла ответа лежит рядом с ним: products.json → products.schema.json (src/schema-files.ts).
function fixtureSchema(file: string): z.ZodType {
  const entry = SCHEMA_FILES.find((item) => item.file === schemaFileOf(file));
  if (entry === undefined) throw new Error(`${file}: в SCHEMA_FILES нет ${schemaFileOf(file)}`);
  return entry.schema;
}

const fixtureFiles = (): string[] =>
  readdirSync(packagePath('fixtures'))
    .filter((name) => name.endsWith('.json') && !name.endsWith('.schema.json'))
    .map((name) => `fixtures/${name}`);

describe('данные моков', () => {
  it.each(TABLE.routes)('$method $path: файл ответа проходит свою схему', (route) => {
    const parse = () =>
      parseWith(fixtureSchema(route.file), JSON.parse(readText(route.file)), 'fixture-invalid', route.file);
    expect(parse).not.toThrow();
  });

  it('каждый файл данных в fixtures/ отвечает на запрос из таблицы', () => {
    const answered = TABLE.routes.map((route) => route.file);
    expect(answered).toEqual(expect.arrayContaining(fixtureFiles()));
  });

  it('три товара, одна коллекция, покупатель', () => {
    expect(productsJson.products).toHaveLength(3);
    expect(TABLE.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /api/store/products',
      'GET /api/store/collections',
      'GET /api/store/auth/me',
    ]);
  });

  it('запрос к API, которого нет в таблице, получает 501', () => {
    expect(mockReplyOf(TABLE, 'GET', '/api/store/orders')).toEqual({ status: 501 });
    expect(mockReplyOf(TABLE, 'POST', '/api/store/auth/login')).toEqual({ status: 501 });
  });

  it('цена — целые копейки: дробную схема отвергает', () => {
    const broken = { ...productsJson, products: [{ ...productsJson.products[0], price: 2990.5 }] };
    expect(() => parseWith(productsReplySchema, broken, 'fixture-invalid', 'products')).toThrow(/products\.0\.price: /);
  });
});

describe('покупатель без пароля', () => {
  it('поле password схема покупателя отвергает', () => {
    const customer = { ...buyerJson.data.customer, password: 'not-a-real-password' };
    const withPassword = { ...buyerJson, data: { customer } };
    const parse = () => parseWith(buyerReplySchema, withPassword, 'fixture-invalid', 'fixtures/buyer.json');
    expect(parse).toThrow(/data\.customer: .*password/);
  });

  it.each(fixtureFiles())('в %s нет слова password', (file) => {
    expect(readText(file)).not.toMatch(/password/i);
  });
});
