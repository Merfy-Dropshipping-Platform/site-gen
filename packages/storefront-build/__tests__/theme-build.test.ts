import { describe, expect, it } from 'vitest';
import { buildRendererBundle } from '../src/theme-build';

// Сама сборка Astro — в тестах test:render. Здесь — проверка папки сборки: она идёт до запуска astro.
describe('buildRendererBundle: папка сборки', () => {
  it.each([
    ['/themes/nova', '/tmp/dist-renderer'],
    ['/themes/nova', '/themes/nova'],
    ['/themes/nova', '/themes/nova-other/dist-renderer'],
  ])('тема %s, папка %s — theme-build-failed, astro не запускается', async (themeDir, outDir) => {
    await expect(buildRendererBundle(themeDir, outDir)).rejects.toMatchObject({
      code: 'theme-build-failed',
      message: `${outDir}: папка сборки — только внутри папки темы`,
    });
  });
});
