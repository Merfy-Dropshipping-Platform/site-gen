// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { BEHAVIOR_BUDGETS, buildBehaviors, type BundleName } from '../build/behaviors';
import { BEHAVIORS } from '../src/core/behaviors/catalog';

// Сборка dist/behaviors (design.md блока 6, раздел 12): файл на поведение, появления, провайдер ctx.animate и часть;
// общий код (Motion) — в общих кусках, которые бандл страницы части 6б склеит без повторов. Бюджеты brotli — тестом,
// как у ядра секций (core.js, 8 КБ).
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const NAMES: readonly BundleName[] = [
  'accordion',
  'dialog',
  'carousel',
  'tabs',
  'nav-menu',
  'quantity',
  'card-photos',
  'sticky-header',
  'video',
  'catalog',
  'search',
  'animate',
  'part',
  'reveal',
];
const dirs: string[] = [];

async function outDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'merfy-behaviors-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildBehaviors', () => {
  it('файл на каждое поведение, появления, провайдер и часть; манифест рядом; ESM с одним экспортом', async () => {
    const dir = await outDir();
    const manifest = await buildBehaviors({ packageDir: PACKAGE_DIR, outDir: dir, version: '0.1.0' });
    expect(Object.keys(manifest.entries).sort()).toEqual([...NAMES].sort());
    expect(NAMES.slice(0, 11)).toEqual(Object.keys(BEHAVIORS));
    expect(manifest.version).toBe('0.1.0');
    expect(JSON.parse(await readFile(join(dir, 'behaviors.json'), 'utf8'))).toEqual(manifest);
    const carousel = await readFile(join(dir, manifest.entries.carousel.file), 'utf8');
    expect(carousel).toMatch(/export\s*\{[^}]*\bcarousel\b[^}]*\}/);
    const files = await readdir(dir);
    for (const name of NAMES) expect(files).toContain(manifest.entries[name].file);
  });

  it('Embla — только в файле слайдера; Motion — в общем куске аккордеона, окна и слайдера', async () => {
    const dir = await outDir();
    const manifest = await buildBehaviors({ packageDir: PACKAGE_DIR, outDir: dir, version: '0.1.0' });
    const withEmbla: string[] = [];
    for (const name of NAMES) {
      const info = manifest.entries[name];
      const texts = await Promise.all([info.file, ...info.chunks].map((file) => readFile(join(dir, file), 'utf8')));
      // Метка кода ядра Embla — 'trimSnaps', значение containScroll по умолчанию: строка есть только в embla-carousel и
      // переживает минификацию. Слово 'embla' не годится — оно есть в данных каталога, а каталог лежит в общем куске
      // (стоп GLM 22.10).
      if (texts.some((text) => text.includes('trimSnaps'))) withEmbla.push(name);
    }
    expect(withEmbla).toEqual(['carousel']);
    const shared = manifest.entries.accordion.chunks.filter(
      (chunk) => manifest.entries.dialog.chunks.includes(chunk) && manifest.entries.carousel.chunks.includes(chunk),
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(manifest.entries.quantity.chunks.filter((chunk) => shared.includes(chunk))).toEqual([]);
  });

  it('бюджеты brotli: каждый файл с его кусками и все файлы вместе', async () => {
    const manifest = await buildBehaviors({ packageDir: PACKAGE_DIR, outDir: await outDir(), version: '0.1.0' });
    for (const name of NAMES) expect(manifest.entries[name].brotli, name).toBeLessThanOrEqual(BEHAVIOR_BUDGETS[name]);
    expect(manifest.total).toBeLessThanOrEqual(BEHAVIOR_BUDGETS.total);
    expect(manifest.entries.carousel.brotli).toBeGreaterThan(manifest.entries.dialog.brotli);
  });

  it('тяжелее бюджета — behavior-too-heavy с именем, файлы не пишутся', async () => {
    const dir = await outDir();
    const error: unknown = await buildBehaviors({
      packageDir: PACKAGE_DIR,
      outDir: dir,
      version: '0.1.0',
      budgets: { quantity: 10 },
    }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code: 'behavior-too-heavy' });
    expect(String(error)).toContain('quantity');
    expect(await readdir(dir)).toEqual([]);
  });
});
