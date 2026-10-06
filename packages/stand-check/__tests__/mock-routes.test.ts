import { describe, expect, it } from 'vitest';
import { isApiPath, mockReplyOf, parseMockRoutes } from '../src/mocks/routes';

const TABLE = parseMockRoutes({
  apiPrefix: '/api/',
  routes: [{ method: 'GET', path: '/api/store/products', file: 'fixtures/products.json' }],
});

describe('mockReplyOf', () => {
  it('запрос из таблицы — 200 и файл ответа', () => {
    expect(mockReplyOf(TABLE, 'GET', '/api/store/products')).toEqual({ status: 200, file: 'fixtures/products.json' });
  });

  it('запроса нет в таблице — 501', () => {
    expect(mockReplyOf(TABLE, 'GET', '/api/store/orders')).toEqual({ status: 501 });
  });

  it('тот же адрес другим методом — 501', () => {
    expect(mockReplyOf(TABLE, 'POST', '/api/store/products')).toEqual({ status: 501 });
  });
});

describe('isApiPath', () => {
  it('запрос к API — по приставке адреса; файлы страницы — нет', () => {
    expect(isApiPath(TABLE, '/api/store/products')).toBe(true);
    expect(isApiPath(TABLE, '/_astro/stand.css')).toBe(false);
  });
});

describe('parseMockRoutes', () => {
  it('адрес вне приставки API — ошибка routes-invalid с адресом', () => {
    const raw = {
      apiPrefix: '/api/',
      routes: [{ method: 'GET', path: '/store/products', file: 'fixtures/products.json' }],
    };
    expect(() => parseMockRoutes(raw)).toThrow(
      /^routes-invalid: таблица подмен:\nroutes: GET \/store\/products: адрес вне \/api\//,
    );
  });

  it('незнакомый метод и файл не .json — ошибки называют поля', () => {
    const raw = { apiPrefix: '/api/', routes: [{ method: 'FETCH', path: '/api/x', file: 'fixtures/x.txt' }] };
    expect(() => parseMockRoutes(raw)).toThrow(/routes\.0\.method: .*\nroutes\.0\.file: /);
  });
});
