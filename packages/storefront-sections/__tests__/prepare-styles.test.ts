import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareSection } from '../src/prepare';

// Шаг «Классы» и токены секции при сохранении (блок 4 «Секций и SDK», Р4-2).
const FIXTURES = resolve(import.meta.dirname, '../fixtures');

function filesOf(folder: string): Record<string, string> {
  const dir = join(FIXTURES, folder);
  return Object.fromEntries(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
}

describe('prepareSection: классы и токены секции', () => {
  it('секция с токеном custom-swatch и классом border-custom-swatch сохраняется', async () => {
    const result = await prepareSection({ prefix: 'shop', files: filesOf('styles/swatch-token') });
    expect(result.ok).toBe(true);
  });

  it('сломанные классы и токен — отказ со всеми кодами разом', async () => {
    const result = await prepareSection({ prefix: 'shop', files: filesOf('broken/classes-broken') });
    expect(result.ok).toBe(false);
    const found = result.ok ? [] : [...new Set(result.problems.map((item) => item.code))].sort();
    expect(found).toEqual([
      'class-arbitrary',
      'class-dark',
      'class-dynamic',
      'class-theme-token',
      'class-unknown',
      'token-invalid',
    ]);
  });
});
