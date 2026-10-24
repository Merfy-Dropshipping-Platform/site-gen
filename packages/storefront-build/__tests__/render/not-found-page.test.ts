import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderShopPage, type ShopTheme } from '../../src/page';
import { startRenderer, type Renderer } from '../../src/renderer';
import { buildRendererBundle } from '../../src/theme-build';
import { standInputs } from '../support';
import { novaTokens } from '../support-theme';

// Страница 404 темой (блок 7 «Секций и SDK», часть 7а) на настоящем рендерере nova: рисуется маршрутом главной (адрес
// /404 Astro держит за своей страницей ошибки), канонический адрес — /404.
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));

describe('страница 404 на рендерере nova', () => {
  let renderer: Renderer;
  let theme: ShopTheme;

  beforeAll(async () => {
    const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
    renderer = await startRenderer(bundle.serverEntry);
    theme = { tokens: novaTokens, render: renderer.render };
  });

  afterAll(async () => {
    await renderer.close();
  });

  it('/404 — файл 404.html, заголовок 404, канонический адрес /404', async () => {
    const page = await renderShopPage(standInputs, '/404', theme);
    const html = Buffer.from(page.file.content).toString('utf8');
    expect(page.file.path).toBe('404.html');
    expect(html).toContain('<title>Страница не найдена · Стенд Nova</title>');
    expect(html).toContain('<link rel="canonical" href="https://nova-stand.example/404">');
  });
});
