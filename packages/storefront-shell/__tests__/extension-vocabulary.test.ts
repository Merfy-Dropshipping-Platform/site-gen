// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// В ядре витрины и SDK нет имён расширений и их секций (блок 12 «Секций и SDK», «Решил сам» п. 32): расширения пишут
// пользователи, ядро знает только точки расширения. Имена есть только в тестах и фикстурах (расширение test-ext).
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES = ['storefront-shell/src', 'storefront-sections/src', 'storefront-build/src', 'storefront-builder/src'];
const NAMES = /loyalt|лояльн|балл|test-ext|отзыв|заявк|(^|[^p])reviews/i;

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : filesOf(full);
    return /\.(ts|astro|json)$/.test(name) ? [full] : [];
  });
}

describe('словарь ядра витрины', () => {
  it('в src пакетов ядра и SDK нет имён расширений', () => {
    const found = SOURCES.flatMap((source) => filesOf(path.join(PACKAGES, source)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) => (NAMES.test(line) ? [`${path.relative(PACKAGES, file)}:${index + 1}`] : [])),
      );
    expect(found).toEqual([]);
  });
});
