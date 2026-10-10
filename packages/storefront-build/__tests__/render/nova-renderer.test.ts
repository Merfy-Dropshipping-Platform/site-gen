import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import probeLocals from '../../fixtures/probe-locals.json';
import { readClientFiles, type BuildFile } from '../../src/client-files';
import { startRenderer, type Renderer } from '../../src/renderer';
import { buildRendererBundle } from '../../src/theme-build';

// Настоящая серверная сборка темы nova (design.md блока 4, В4-4 Б): Astro собирает её один раз перед тестами, страницы
// рисует node без Vite. Папка сборки — внутри темы, её прячет .gitignore темы.
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-test/', import.meta.url));

describe('рисовальщик темы nova', () => {
  let renderer: Renderer;
  let clientFiles: BuildFile[];
  let html: string;

  beforeAll(async () => {
    const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
    renderer = await startRenderer(bundle.serverEntry);
    clientFiles = await readClientFiles(bundle.clientDir);
    html = await renderer.render('/', probeLocals);
  });

  afterAll(async () => {
    await renderer.close();
  });

  it('главная: язык, заголовок, описание, ключевые слова, канонический адрес — в HTML', () => {
    expect(html).toContain('<html lang="ru-RU">');
    expect(html).toContain('<title>Стенд Nova</title>');
    expect(html).toContain('<meta name="description" content="Магазин-стенд новой темы">');
    expect(html).toContain('<meta name="keywords" content="шарфы, лён">');
    expect(html).toContain('<link rel="canonical" href="https://nova-stand.example/">');
  });

  it('имя магазина и год — из данных сборщика', () => {
    expect(html).toContain('<h1>Стенд Nova</h1>');
    expect(html).toContain('© 2026 Стенд Nova');
  });

  it('конфиг и CSS токенов встают в <head> как есть', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain(probeLocals.head.configHtml);
    expect(head).toContain(`<style id="merfy-tokens">${probeLocals.head.tokensCss}</style>`);
  });

  // CSS два: главной (шрифты) и стенда в превью (Tailwind, блок 8). Главная ссылается ровно на один из них.
  it('файлы клиента: CSS и шрифты, в HTML главной — ссылка на один CSS из них', () => {
    const css = clientFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.path);
    expect(css).toHaveLength(2);
    expect(clientFiles.some((file) => file.path.endsWith('.woff2'))).toBe(true);
    expect(css.filter((path) => html.includes(`href="/${path}"`))).toHaveLength(1);
  });

  it('такой страницы у темы нет — page-unknown', async () => {
    await expect(renderer.render('/nope', probeLocals)).rejects.toMatchObject({ code: 'page-unknown' });
  });
});
