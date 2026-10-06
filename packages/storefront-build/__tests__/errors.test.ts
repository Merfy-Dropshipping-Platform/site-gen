import { describe, expect, it } from 'vitest';
import { StorefrontBuildError } from '../src/errors';

describe('StorefrontBuildError', () => {
  it('текст начинается с пути, код и путь — в полях ошибки', () => {
    const error = new StorefrontBuildError('entity-duplicate', 'такая сущность уже есть', { path: 'data.entities.2' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StorefrontBuildError');
    expect(error.message).toBe('data.entities.2: такая сущность уже есть');
    expect(error.code).toBe('entity-duplicate');
    expect(error.path).toBe('data.entities.2');
  });

  it('без пути — только текст', () => {
    const error = new StorefrontBuildError('data-not-received', 'снимок данных не получен');
    expect(error.message).toBe('снимок данных не получен');
    expect(error.path).toBeUndefined();
  });

  it('хранит причину: исходная ошибка не теряется', () => {
    const cause = new Error('astro build: exit 1');
    const error = new StorefrontBuildError('theme-build-failed', 'astro build рисовальщика упал', { cause });
    expect(error.cause).toBe(cause);
  });
});
