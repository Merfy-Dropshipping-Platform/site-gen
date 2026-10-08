import { describe, expect, it } from 'vitest';
import { StorefrontStorageError } from '../src/errors';

describe('StorefrontStorageError', () => {
  it('текст начинается с пути, код и путь — полями', () => {
    const error = new StorefrontStorageError('object-invalid', 'указатель не формата v1', {
      path: 'pointers/scarf.json',
    });
    expect(error.message).toBe('pointers/scarf.json: указатель не формата v1');
    expect(error.code).toBe('object-invalid');
    expect(error.path).toBe('pointers/scarf.json');
    expect(error.name).toBe('StorefrontStorageError');
  });

  it('без пути — текст как есть, причина сохраняется', () => {
    const cause = new Error('сеть');
    const error = new StorefrontStorageError('store-failed', 'хранилище ответило ошибкой', { cause });
    expect(error.message).toBe('хранилище ответило ошибкой');
    expect(error.path).toBeUndefined();
    expect(error.cause).toBe(cause);
  });
});
