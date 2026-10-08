import { describe, expect, it } from 'vitest';
import { StorefrontConfigError } from '../src/errors';

describe('StorefrontConfigError', () => {
  it('текст начинается с пути поля, код и путь — в полях ошибки', () => {
    const error = new StorefrontConfigError('config-invalid', 'у опубликованного магазина нужен адрес', {
      path: 'shop.url',
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StorefrontConfigError');
    expect(error.message).toBe('shop.url: у опубликованного магазина нужен адрес');
    expect(error.code).toBe('config-invalid');
    expect(error.path).toBe('shop.url');
  });

  it('без пути — только текст', () => {
    const error = new StorefrontConfigError('config-missing', 'на странице нет тега #merfy-config');
    expect(error.message).toBe('на странице нет тега #merfy-config');
    expect(error.path).toBeUndefined();
  });

  it('хранит причину: исходная ошибка не теряется', () => {
    const cause = new SyntaxError('Unexpected end of JSON input');
    const error = new StorefrontConfigError('config-invalid', 'в теге не JSON', { cause });
    expect(error.cause).toBe(cause);
  });
});
