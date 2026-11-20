import { fileURLToPath } from 'node:url';
import { hashOf } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { libraryFilesOf } from '../src/library-files';
import { libraryLatestOf } from '../src/library-history';

// Текущая версия библиотечной секции с диска: файлы, чей отпечаток — последняя версия из истории.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

describe('версия библиотечной секции с диска', () => {
  it.each(['faq', 'cart-badge'])('%s: файлы с отпечатком последней версии истории', async (name) => {
    const latest = libraryLatestOf(name);
    expect(latest).toBeDefined();
    if (latest === undefined) return;
    const files = await libraryFilesOf(PACKAGE_DIR, latest);
    expect(files && hashOf(files)).toBe(latest.hash);
    expect(files).toHaveProperty('section.json');
  });

  it('отпечатка нет на диске (образ старше истории) — undefined', async () => {
    const stale = { hash: 'sha256:not-on-disk', name: 'faq', version: 99 };
    expect(await libraryFilesOf(PACKAGE_DIR, stale)).toBeUndefined();
  });
});
