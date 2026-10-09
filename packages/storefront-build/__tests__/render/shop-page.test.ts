import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderShopPage, type ShopTheme } from '../../src/page';
import { startRenderer, type Renderer } from '../../src/renderer';
import { buildRendererBundle } from '../../src/theme-build';
import { changedInputs, standInputs } from '../support';
import { novaTokens } from '../support-theme';

// Главная магазина стенда на настоящем рисовальщике темы nova (design.md блока 4, Св-1 В и SEO).
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));

const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

describe('страница магазина на рисовальщике nova', () => {
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

  it('главная по договору SEO: язык, заголовок, описание, канонический адрес', async () => {
    const html = text((await renderShopPage(standInputs, '/', theme)).file.content);
    expect(html).toContain('<html lang="ru-RU">');
    expect(html).toContain('<title>Стенд Nova</title>');
    expect(html).toContain('<meta name="description" content="Магазин-стенд новой темы">');
    expect(html).toContain('<link rel="canonical" href="https://nova-stand.example/">');
  });

  // Владелец 08.10: «SEO-описание пользователь может не заполнить, но при этом сайт должен работать».
  it('мерчант не заполнил SEO-описание — главная собрана, тега description нет', async () => {
    const plain = changedInputs((inputs) => (inputs.site.description = ''));
    const html = text((await renderShopPage(plain, '/', theme)).file.content);
    expect(html).toContain('<title>Стенд Nova</title>');
    expect(html).not.toContain('name="description"');
    expect(html).not.toContain('name="keywords"');
  });

  // Заполненное мерчантом попадает в страницу (владелец 08.10).
  it('мерчант заполнил SEO-заголовок и ключевые слова — они в <title> и <meta name="keywords">, имя — в <h1>', async () => {
    const seo = changedInputs((inputs) =>
      Object.assign(inputs.site, { seoTitle: 'Шарфы изо льна', keywords: 'шарфы, лён' }),
    );
    const html = text((await renderShopPage(seo, '/', theme)).file.content);
    expect(html).toContain('<title>Шарфы изо льна</title>');
    expect(html).toContain('<meta name="keywords" content="шарфы, лён">');
    expect(html).toContain('<h1>Стенд Nova</h1>');
  });

  it('конфиг магазина в живом режиме и CSS токенов с правкой мерчанта — в <head>', async () => {
    const html = text((await renderShopPage(standInputs, '/', theme)).file.content);
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain('<script type="application/json" id="merfy-config">{"v":1,"mode":"live"');
    expect(head).toContain('--radius-button: 0.25rem;');
  });

  it('две отрисовки одних входов — одинаковые байты и строка', async () => {
    const [first, second] = await Promise.all([
      renderShopPage(standInputs, '/', theme),
      renderShopPage(structuredClone(standInputs), '/', theme),
    ]);
    expect(Buffer.from(second.file.content).equals(first.file.content)).toBe(true);
    expect(second.row).toEqual(first.row);
  });

  it('правка имени магазина — другая главная', async () => {
    const renamed = changedInputs((inputs) => (inputs.site.name = 'Лён и шерсть'));
    const page = await renderShopPage(renamed, '/', theme);
    expect(text(page.file.content)).toContain('<h1>Лён и шерсть</h1>');
  });
});
