// @vitest-environment node
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_FILE, buildPreview } from '../build/preview';
import { SECTION_FAILURE_EVENT } from '../src/core/events';
import {
  PREVIEW_BUNDLE_TAG_ID,
  PREVIEW_REPLACE_EVENT,
  PREVIEW_UPDATE_EVENT,
  PREVIEW_UPDATED_EVENT,
  SECTION_ERROR_EVENT,
  SECTION_UPDATED_MESSAGE,
} from '../src/core/preview-protocol';

// Сборка скрипта превью (блок 5 «Секций и SDK», часть 5г): dist/preview.js — обычный скрипт (IIFE), сборщик вставляет
// его текстом в <script> HTML превью. esbuild в среде jsdom не работает — файл идёт в среде node.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const OUT_ROOT = fileURLToPath(new URL('../dist-test/preview-build', import.meta.url));

beforeAll(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

describe('сборка скрипта превью', () => {
  it('dist/preview.js: без import и export верхнего уровня, с загрузчиком import() и именами протокола', async () => {
    const outDir = join(OUT_ROOT, 'ok');
    const built = await buildPreview({ packageDir: PACKAGE_DIR, outDir });
    expect(await readdir(outDir)).toEqual([PREVIEW_FILE]);
    const code = await readFile(join(outDir, PREVIEW_FILE), 'utf8');
    expect(built.bytes).toBe(Buffer.byteLength(code));
    expect(code).not.toMatch(/^\s*(import|export)[\s{*]/m);
    expect(code).toContain('import(');
    expect(code).not.toMatch(/<\/script|<!--/i);
    const names = [
      PREVIEW_UPDATE_EVENT,
      PREVIEW_REPLACE_EVENT,
      PREVIEW_UPDATED_EVENT,
      PREVIEW_BUNDLE_TAG_ID,
      SECTION_UPDATED_MESSAGE,
    ];
    expect(names.filter((name) => !code.includes(name))).toEqual([]);
  });

  it('«<!--» в тексте сборки — preview-unsafe, файл не пишется', async () => {
    const outDir = join(OUT_ROOT, 'unsafe');
    const entry = join(PACKAGE_DIR, 'fixtures/build/unsafe-preview.js');
    await expect(buildPreview({ packageDir: PACKAGE_DIR, outDir, entry })).rejects.toMatchObject({
      code: 'preview-unsafe',
    });
    await expect(readdir(outDir)).rejects.toThrow('ENOENT');
  });

  it('имя сбоя экземпляра в протоколе превью — то же, что у ядра', () => {
    expect(SECTION_ERROR_EVENT).toBe(SECTION_FAILURE_EVENT);
  });
});
