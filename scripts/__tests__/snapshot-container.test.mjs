// Тесты для lib/snapshot-container.mjs — рендер через Astro Container + PNG.
//
// Подход: использовать stub container factory чтобы не грузить реальный
// astro/container (он медленный, нагружает Vite). Реальный путь проверяем
// одним отдельным smoke-тестом который условно skip-ается если dist отсутствует.
//
// Также testируем utility-функции (loadBaseDefaultsRecord, buildCssVarsForTheme,
// loadBlockDefaults) — они чисто файловые, без Astro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  loadBaseDefaultsRecord,
  buildCssVarsForTheme,
  loadBlockDefaults,
  renderBlockToHtml,
  captureScreenshotFromHtml,
  captureBlockSnapshot,
  loadCompiledBlock,
  _setContainerFactory,
  _resetContainerFactory,
  _setPlaywrightFactory,
  _resetPlaywrightFactory,
} from '../lib/snapshot-container.mjs';

async function tmpDir(prefix = 'snap-test-') {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

// ───────────────────────────────────────────────────────────────
// 1. loadBaseDefaultsRecord
// ───────────────────────────────────────────────────────────────

test('loadBaseDefaultsRecord: парсит базовый файл с одной записью', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'base-defaults.ts');
  await fs.writeFile(file, `
import type { TokenKey } from './registry';
export const BASE_DEFAULTS: Record<TokenKey, string> = {
  '--color-bg': '255 255 255',
};
  `, 'utf-8');
  const r = await loadBaseDefaultsRecord(file);
  assert.equal(r['--color-bg'], '255 255 255');
});

test('loadBaseDefaultsRecord: несколько записей', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'base-defaults.ts');
  await fs.writeFile(file, `
export const BASE_DEFAULTS = {
  '--color-bg': '255 255 255',
  '--container-max-width': '1320px',
  '--font-body': 'sans-serif',
};
  `, 'utf-8');
  const r = await loadBaseDefaultsRecord(file);
  assert.equal(r['--color-bg'], '255 255 255');
  assert.equal(r['--container-max-width'], '1320px');
  assert.equal(r['--font-body'], 'sans-serif');
});

test('loadBaseDefaultsRecord: пустой объект', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'base-defaults.ts');
  await fs.writeFile(file, `export const BASE_DEFAULTS = {};`, 'utf-8');
  const r = await loadBaseDefaultsRecord(file);
  assert.equal(Object.keys(r).length, 0);
});

// ───────────────────────────────────────────────────────────────
// 2. buildCssVarsForTheme
// ───────────────────────────────────────────────────────────────

test('buildCssVarsForTheme: возвращает :root с base + theme.defaults', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = { '--a': '1px', '--b': '2px' };`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({
    id: 'test',
    defaults: { '--c': '3px' },
  }), 'utf-8');
  const css = await buildCssVarsForTheme(themeJson, baseDefs);
  assert.match(css, /:root \{/);
  assert.match(css, /--a:\s*1px;/);
  assert.match(css, /--b:\s*2px;/);
  assert.match(css, /--c:\s*3px;/);
});

test('buildCssVarsForTheme: theme.defaults перекрывает base', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = { '--a': 'base' };`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({
    defaults: { '--a': 'theme-wins' },
  }), 'utf-8');
  const css = await buildCssVarsForTheme(themeJson, baseDefs);
  assert.match(css, /--a:\s*theme-wins;/);
  // base value should NOT be present (overridden)
  const matches = css.match(/--a:\s*[^;]+;/g) || [];
  assert.equal(matches.length, 1, 'token должен встретиться один раз');
});

test('buildCssVarsForTheme: colorSchemes[0] добавляются', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = {};`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({
    defaults: {},
    colorSchemes: [{ id: 'scheme-1', tokens: { '--color-bg': '0 0 0' } }],
  }), 'utf-8');
  const css = await buildCssVarsForTheme(themeJson, baseDefs);
  assert.match(css, /--color-bg:\s*0 0 0;/);
});

test('buildCssVarsForTheme: без colorSchemes — работает', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = { '--a': '1' };`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: { '--b': '2' } }), 'utf-8');
  const css = await buildCssVarsForTheme(themeJson, baseDefs);
  assert.match(css, /--a:\s*1;/);
  assert.match(css, /--b:\s*2;/);
});

// ───────────────────────────────────────────────────────────────
// 3. loadBlockDefaults (parsing puckConfig)
// ───────────────────────────────────────────────────────────────

test('loadBlockDefaults: парсит defaultProps', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'Header.puckConfig.ts');
  await fs.writeFile(file, `
export const HeaderPuckConfig = {
  defaultProps: {
    siteTitle: 'Store',
    logo: '/logo.svg',
  },
};
  `, 'utf-8');
  const r = await loadBlockDefaults(file);
  assert.equal(r.siteTitle, 'Store');
  assert.equal(r.logo, '/logo.svg');
});

test('loadBlockDefaults: парсит defaults', async (t) => {
  const dir = await tmpDir();
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'Header.puckConfig.ts');
  await fs.writeFile(file, `
export const X = {
  defaults: {
    a: 'b',
  },
};
  `, 'utf-8');
  const r = await loadBlockDefaults(file);
  assert.equal(r.a, 'b');
});

test('loadBlockDefaults: возвращает {} если файл не существует', async () => {
  const r = await loadBlockDefaults('/nonexistent/path/Header.puckConfig.ts');
  assert.deepEqual(r, {});
});

// ───────────────────────────────────────────────────────────────
// 4. renderBlockToHtml через stub container
// ───────────────────────────────────────────────────────────────

test('renderBlockToHtml: оборачивает в полный HTML-документ с :root', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  // Stub container который возвращает фиксированный inner HTML
  _setContainerFactory(async () => ({
    renderToString: async (Component, opts) => {
      return `<div data-stub="yes">Inner content with props: ${JSON.stringify(opts?.props || {})}</div>`;
    },
  }));

  // Создать fake скомпилированный блок в dist
  // (loadCompiledBlock смотрит на dist/astro-blocks/<pkg>__<block>__<block>.mjs)
  // — но в тесте мы перехватываем сразу container.renderToString. Все равно
  // loadCompiledBlock должен найти что-то — создадим заглушку:
  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__TestBlock__TestBlock.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function StubComp() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = { '--color-bg': '255 255 255' };`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: {} }), 'utf-8');

  const html = await renderBlockToHtml({
    blockName: 'TestBlock',
    themeId: 'rose',
    props: { siteTitle: 'Demo' },
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
  });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<style>/);
  assert.match(html, /--color-bg:\s*255 255 255;/);
  assert.match(html, /data-stub="yes"/);
  assert.match(html, /Demo/, 'props должны прокинуться');
});

test('renderBlockToHtml: themeId оказывается в body data-theme', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  _setContainerFactory(async () => ({
    renderToString: async () => `<header>x</header>`,
  }));

  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__TestBlock2__TestBlock2.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function S() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = {};`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: {} }), 'utf-8');

  const html = await renderBlockToHtml({
    blockName: 'TestBlock2',
    themeId: 'satin',
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
  });
  assert.match(html, /data-theme="satin"/);
  assert.match(html, /class="theme-satin color-scheme-1"/);
});

test('renderBlockToHtml: props мерджатся с puckConfig.defaults', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  let capturedProps = null;
  _setContainerFactory(async () => ({
    renderToString: async (_C, opts) => {
      capturedProps = opts?.props;
      return `<div>x</div>`;
    },
  }));

  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__TestBlock3__TestBlock3.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function S() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  const puck = path.join(dir, 'TestBlock3.puckConfig.ts');
  await fs.writeFile(baseDefs, `export const X = {};`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: {} }), 'utf-8');
  await fs.writeFile(puck, `
export const X = {
  defaults: {
    siteTitle: 'DefaultStore',
    logo: 'default.svg',
  },
};
  `, 'utf-8');

  await renderBlockToHtml({
    blockName: 'TestBlock3',
    themeId: 'rose',
    props: { logo: 'custom.svg' },
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
    puckConfigPath: puck,
  });

  assert.equal(capturedProps.siteTitle, 'DefaultStore', 'дефолт сохранён');
  assert.equal(capturedProps.logo, 'custom.svg', 'props переопределяет defaults');
});

// ───────────────────────────────────────────────────────────────
// 5. loadCompiledBlock — ошибка если блок отсутствует
// ───────────────────────────────────────────────────────────────

test('loadCompiledBlock: понятная ошибка если блок не скомпилирован', async () => {
  await assert.rejects(
    () => loadCompiledBlock('NonExistentBlock42'),
    /Скомпилированный блок не найден.*pnpm build:blocks/s,
  );
});

// ───────────────────────────────────────────────────────────────
// 6. PNG через Playwright (со stub factory)
// ───────────────────────────────────────────────────────────────

test('captureScreenshotFromHtml: создаёт файл через stub Playwright', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetPlaywrightFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  let calls = { launch: 0, setContent: 0, screenshot: 0, close: 0 };
  const fakePage = {
    setContent: async (html) => { calls.setContent++; },
    waitForLoadState: async () => {},
    screenshot: async ({ path: outPath }) => {
      calls.screenshot++;
      await fs.writeFile(outPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
    },
    $: async () => null,
  };
  const fakeCtx = { newPage: async () => fakePage, close: async () => {} };
  const fakeBrowser = {
    newContext: async () => fakeCtx,
    close: async () => { calls.close++; },
  };
  _setPlaywrightFactory(async () => ({
    chromium: { launch: async () => { calls.launch++; return fakeBrowser; } },
  }));

  const outPath = path.join(dir, 'test.png');
  await captureScreenshotFromHtml('<html><body>x</body></html>', outPath);

  const stat = await fs.stat(outPath);
  assert.ok(stat.size > 0, 'PNG файл существует и не пуст');
  assert.equal(calls.launch, 1);
  assert.equal(calls.screenshot, 1);
  assert.equal(calls.close, 1);
});

test('captureScreenshotFromHtml: selector — element.screenshot', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetPlaywrightFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  let selectorUsed = null;
  const fakeElement = {
    screenshot: async ({ path: outPath }) => {
      selectorUsed = 'element';
      await fs.writeFile(outPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    },
  };
  const fakePage = {
    setContent: async () => {},
    waitForLoadState: async () => {},
    screenshot: async ({ path: outPath }) => {
      selectorUsed = 'page';
      await fs.writeFile(outPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    },
    $: async (sel) => fakeElement,
  };
  const fakeBrowser = {
    newContext: async () => ({ newPage: async () => fakePage, close: async () => {} }),
    close: async () => {},
  };
  _setPlaywrightFactory(async () => ({
    chromium: { launch: async () => fakeBrowser },
  }));

  await captureScreenshotFromHtml('<html><body><div data-x>x</div></body></html>', path.join(dir, 't.png'), {
    selector: '[data-x]',
  });
  assert.equal(selectorUsed, 'element');
});

test('captureScreenshotFromHtml: width/height пробрасываются', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetPlaywrightFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  let viewport = null;
  const fakeBrowser = {
    newContext: async (opts) => {
      viewport = opts.viewport;
      return {
        newPage: async () => ({
          setContent: async () => {},
          waitForLoadState: async () => {},
          screenshot: async ({ path: outPath }) => fs.writeFile(outPath, Buffer.from([0x89, 0x50])),
          $: async () => null,
        }),
        close: async () => {},
      };
    },
    close: async () => {},
  };
  _setPlaywrightFactory(async () => ({
    chromium: { launch: async () => fakeBrowser },
  }));

  await captureScreenshotFromHtml('<html></html>', path.join(dir, 'x.png'), {
    width: 1920, height: 1080,
  });
  assert.deepEqual(viewport, { width: 1920, height: 1080 });
});

// ───────────────────────────────────────────────────────────────
// 7. captureBlockSnapshot — полный flow
// ───────────────────────────────────────────────────────────────

test('captureBlockSnapshot: создаёт оба файла .html и .png', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    _resetPlaywrightFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  _setContainerFactory(async () => ({
    renderToString: async () => `<div data-block-x>Hello</div>`,
  }));

  const fakeBrowser = {
    newContext: async () => ({
      newPage: async () => ({
        setContent: async () => {},
        waitForLoadState: async () => {},
        screenshot: async ({ path: outPath }) => fs.writeFile(outPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])),
        $: async () => null,
      }),
      close: async () => {},
    }),
    close: async () => {},
  };
  _setPlaywrightFactory(async () => ({
    chromium: { launch: async () => fakeBrowser },
  }));

  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__SnapBlock__SnapBlock.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function S() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = { '--a': '1' };`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: {} }), 'utf-8');

  const htmlPath = path.join(dir, 'snap.html');
  const pngPath = path.join(dir, 'snap.png');

  const r = await captureBlockSnapshot({
    blockName: 'SnapBlock',
    themeId: 'rose',
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
    htmlPath,
    pngPath,
  });

  assert.ok(r.htmlBytes > 0);
  assert.ok(r.pngBytes > 0);
  assert.equal(r.htmlPath, htmlPath);
  assert.equal(r.pngPath, pngPath);

  const htmlContent = await fs.readFile(htmlPath, 'utf-8');
  assert.match(htmlContent, /data-block-x/);
});

// ───────────────────────────────────────────────────────────────
// 8. CSS-переменные содержат ожидаемые значения после рендера
// ───────────────────────────────────────────────────────────────

test('renderBlockToHtml: --color-bg оборачивается в :root', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  _setContainerFactory(async () => ({
    renderToString: async () => `<header>x</header>`,
  }));

  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__TestBlockCss__TestBlockCss.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function S() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `
export const X = {
  '--color-bg': '255 255 255',
  '--color-text': '0 0 0',
};
  `, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({
    defaults: { '--font-body': "'Inter', sans-serif" },
  }), 'utf-8');

  const html = await renderBlockToHtml({
    blockName: 'TestBlockCss',
    themeId: 'rose',
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
  });

  assert.match(html, /--color-bg:\s*255 255 255;/);
  assert.match(html, /--color-text:\s*0 0 0;/);
  assert.match(html, /--font-body:\s*'Inter', sans-serif;/);
});

// ───────────────────────────────────────────────────────────────
// 9. Кэш контейнера (повторный getContainer не создаёт заново)
// ───────────────────────────────────────────────────────────────

test('container factory: вызывается один раз для двух renderBlockToHtml', async (t) => {
  const dir = await tmpDir();
  t.after(async () => {
    _resetContainerFactory();
    await fs.rm(dir, { recursive: true, force: true });
  });

  let factoryCalls = 0;
  _setContainerFactory(async () => {
    factoryCalls++;
    return {
      renderToString: async () => `<div>x</div>`,
    };
  });

  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const DIST = path.join(SITES_ROOT, 'dist', 'astro-blocks');
  const stubBlock = path.join(DIST, 'theme-base__CacheBlock__CacheBlock.mjs');
  await fs.mkdir(DIST, { recursive: true });
  await fs.writeFile(stubBlock, `export default function S() {}`, 'utf-8');
  t.after(async () => { await fs.rm(stubBlock, { force: true }); });

  const baseDefs = path.join(dir, 'base-defaults.ts');
  const themeJson = path.join(dir, 'theme.json');
  await fs.writeFile(baseDefs, `export const X = {};`, 'utf-8');
  await fs.writeFile(themeJson, JSON.stringify({ defaults: {} }), 'utf-8');

  await renderBlockToHtml({
    blockName: 'CacheBlock', themeId: 'rose',
    themeJsonPath: themeJson, baseDefaultsPath: baseDefs,
  });
  await renderBlockToHtml({
    blockName: 'CacheBlock', themeId: 'rose',
    themeJsonPath: themeJson, baseDefaultsPath: baseDefs,
  });

  assert.equal(factoryCalls, 1, 'container factory должна вызваться один раз');
});

// ───────────────────────────────────────────────────────────────
// 10. Реальный smoke-тест Astro Container (только если dist готов)
// ───────────────────────────────────────────────────────────────

test('REAL Astro Container: рендерит Header через настоящий container', async (t) => {
  // Skip если dist не готов
  const SITES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const distHeader = path.join(SITES_ROOT, 'dist', 'astro-blocks', 'theme-base__Header__Header.mjs');
  try {
    await fs.access(distHeader);
  } catch {
    t.skip('dist/astro-blocks/theme-base__Header__Header.mjs нет; запусти pnpm build:blocks');
    return;
  }

  // НЕ переопределяем factory — используем реальный
  _resetContainerFactory();

  const baseDefs = path.join(SITES_ROOT, 'packages/theme-contract/tokens/base-defaults.ts');
  const themeJson = path.join(SITES_ROOT, 'packages/theme-rose/theme.json');
  const puck = path.join(SITES_ROOT, 'packages/theme-base/blocks/Header/Header.puckConfig.ts');

  const html = await renderBlockToHtml({
    blockName: 'Header',
    themeId: 'rose',
    props: {
      siteTitle: 'Demo',
      logo: '',
      logoPosition: 'top-left',
      stickiness: 'none',
      menuType: 'dropdown',
      navigationLinks: [{ label: 'Главная', href: '/' }],
      actionButtons: { showSearch: true, showCart: true, showProfile: true },
      padding: { top: 16, bottom: 16 },
    },
    themeJsonPath: themeJson,
    baseDefaultsPath: baseDefs,
    puckConfigPath: puck,
  });

  assert.ok(html.length > 1000, `HTML должен быть осмысленным, получили ${html.length}b`);
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /data-header-wrapper/);
  assert.match(html, /Demo/, 'siteTitle должен попасть в рендер');
});
