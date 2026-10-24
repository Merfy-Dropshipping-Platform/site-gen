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

  it('теги для соцсетей — из данных сборщика; картинка есть — og:image есть', () => {
    expect(html).toContain('<meta property="og:site_name" content="Стенд Nova">');
    expect(html).toContain('<meta property="og:image" content="https://nova-stand.example/logo.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });

  // Шапка, страница и подвал (блок 1 «Секций и SDK», часть 4): разметка секций по группам; своих заголовка и подвала у
  // темы нет — их выводят секции.
  it('шапка — до <main>, секции страницы — в <main>, подвал — после; своих <h1> и подвала нет', async () => {
    const page = await renderer.render('/', {
      ...probeLocals,
      header: ['<merfy-section data-section-id="header-1">Шапка</merfy-section>'],
      sections: ['<merfy-section data-section-id="hero-1">Первый экран</merfy-section>'],
      footer: ['<merfy-section data-section-id="footer-1">Подвал</merfy-section>'],
    });
    const at = ['header-1', '<main>', 'hero-1', '</main>', 'footer-1'].map((marker) => page.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    expect(page).not.toContain('<h1>');
    expect(page).not.toContain('©');
  });

  it('своя страница — по каноническому адресу страницы; другой адрес — page-unknown', async () => {
    const head = { ...probeLocals.head, canonical: 'https://nova-stand.example/o-nas' };
    await expect(renderer.render('/o-nas', { ...probeLocals, head })).resolves.toContain('<main>');
    await expect(renderer.render('/dostavka', { ...probeLocals, head })).rejects.toMatchObject({ code: 'page-unknown' });
  });

  // Страницы записей (блок 8 «Секций и SDK», часть 8б): адрес из двух и трёх частей; кириллица в каноническом адресе
  // закодирована, в адресе запроса — нет.
  it('страница записи — по вложенному адресу, и с кириллицей; другой адрес — page-unknown', async () => {
    const at = (path: string) => ({
      ...probeLocals,
      head: { ...probeLocals.head, canonical: new URL(path, 'https://nova-stand.example').href },
    });
    await expect(renderer.render('/product/sharf', at('/product/sharf'))).resolves.toContain('<main>');
    await expect(renderer.render('/blogs/novosti/linen', at('/blogs/novosti/linen'))).resolves.toContain('<main>');
    await expect(renderer.render('/product/шарф', at('/product/шарф'))).resolves.toContain('<main>');
    await expect(renderer.render('/product/pled', at('/product/sharf'))).rejects.toMatchObject({ code: 'page-unknown' });
  });

  it('разметка для поиска — в <head> как есть; нет поля — разметки нет', async () => {
    const data = '<script type="application/ld+json">{"@type":"Product","name":"Шарф"}</script>';
    const page = await renderer.render('/', { ...probeLocals, head: { ...probeLocals.head, structuredData: data } });
    expect(page.slice(page.indexOf('<head>'), page.indexOf('</head>'))).toContain(data);
    expect(html).not.toContain('application/ld+json');
  });

  it('конфиг и CSS токенов встают в <head> как есть', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain(probeLocals.head.configHtml);
    expect(head).toContain(`<style id="merfy-tokens">${probeLocals.head.tokensCss}</style>`);
  });

  // CSS один — стенда в превью (Tailwind, блок 8). Шрифт темы — из библиотеки платформы (блок 12): своих файлов шрифтов
  // и CSS с ними у темы нет, главная на CSS не ссылается.
  it('файлы клиента: один CSS стенда, файлов шрифтов нет, в HTML главной ссылки на CSS нет', () => {
    const css = clientFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.path);
    expect(css).toHaveLength(1);
    expect(clientFiles.some((file) => file.path.endsWith('.woff2'))).toBe(false);
    expect(css.filter((path) => html.includes(`href="/${path}"`))).toEqual([]);
  });

  it('такой страницы у темы нет — page-unknown', async () => {
    await expect(renderer.render('/nope', probeLocals)).rejects.toMatchObject({ code: 'page-unknown' });
  });
});
