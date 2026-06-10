import { composeV2Page } from '../v2-page-composer';

const SHELL = `<!DOCTYPE html><html><head><title>ROSE</title><link rel="stylesheet" href="/__theme/rose/_astro/a.css"></head>
<body class="antialiased bg-white"><div data-nt="promo-banner">OLD-PROMO</div><div class="w-full"><header>OLD-HEADER</header></div><main>OLD-MAIN</main><footer>OLD-FOOTER</footer><div id="cart-drawer-root"></div><script>keepMe("/api/x")</script></body></html>`;

const blocks = () => ({
  blockTypes: ['PromoBanner', 'Header', 'Hero', 'Footer'],
  blocksHtml: [
    '<div data-puck-component-id="PromoBanner-1">PROMO</div>',
    '<div class="w-full" data-puck-component-id="Header-1">HEADER</div>',
    '<section data-puck-component-id="Hero-1"><img src="/images/x.png">HERO</section>',
    '<footer data-puck-component-id="Footer-1">FOOTER</footer>',
  ],
});

describe('composeV2Page', () => {
  it('пересаживает блоки: header-блоки до <main>, тело в <main>, footer после; хвост body сохраняется', () => {
    const html = composeV2Page({ shellHtml: SHELL, ...blocks(), assetPrefix: null });
    expect(html).not.toBeNull();
    const h = html as string;
    expect(h).not.toContain('OLD-PROMO');
    expect(h).not.toContain('OLD-HEADER');
    expect(h).not.toContain('OLD-MAIN');
    expect(h).not.toContain('OLD-FOOTER');
    expect(h).toContain('PROMO');
    expect(h).toContain('<main>');
    expect(h.indexOf('HEADER')).toBeLessThan(h.indexOf('<main>'));
    expect(h.indexOf('HERO')).toBeGreaterThan(h.indexOf('<main>'));
    expect(h.indexOf('FOOTER')).toBeGreaterThan(h.indexOf('</main>'));
    expect(h).toContain('cart-drawer-root'); // хвост body сохранён
    expect(h).toContain('keepMe("/api/x")'); // скрипты шелла не тронуты
    expect(h).toContain('/__theme/rose/_astro/a.css'); // head сохранён
  });

  it('assetPrefix переписывает корневые URL в блоках, но не тела <script> и не абсолютные https', () => {
    const html = composeV2Page({
      shellHtml: SHELL,
      blockTypes: ['Hero'],
      blocksHtml: ['<section data-puck-component-id="Hero-1"><img src="/images/x.png"><img src="https://minio.merfy.ru/y.png"><script>fetch("/api/z")</script></section>'],
      assetPrefix: '/__theme/rose',
    });
    expect(html).toContain('src="/__theme/rose/images/x.png"');
    expect(html).toContain('https://minio.merfy.ru/y.png');
    expect(html).toContain('fetch("/api/z")');
  });

  it('titleOverride заменяет <title> шелла', () => {
    const html = composeV2Page({ shellHtml: SHELL, ...blocks(), assetPrefix: null, titleOverride: 'Контакты' });
    expect(html).toContain('<title>Контакты</title>');
    expect(html).not.toContain('<title>ROSE</title>');
  });

  it('без </footer> в шелле возвращает null (несовместимая структура — зовущий фоллбечит)', () => {
    const noFooterShell = '<!DOCTYPE html><html><head></head><body><div>X</div></body></html>';
    const html = composeV2Page({ shellHtml: noFooterShell, ...blocks(), assetPrefix: null });
    expect(html).toBeNull();
  });

  it('tokensCss вставляет <style id="__merfy_tokens_css"> перед </head>', () => {
    const html = composeV2Page({ shellHtml: SHELL, ...blocks(), assetPrefix: null, tokensCss: ':root{--radius-button:4px}' });
    expect(html).toContain('<style id="__merfy_tokens_css">:root{--radius-button:4px}</style></head>');
    // head остального не потерян
    expect(html).toContain('/__theme/rose/_astro/a.css');
  });

  it('без tokensCss style-тег не появляется', () => {
    const html = composeV2Page({ shellHtml: SHELL, ...blocks(), assetPrefix: null });
    expect(html).not.toContain('__merfy_tokens_css');
  });

  it('blockSchemes оборачивает блок в .color-scheme-N, схема null — без обёртки', () => {
    const html = composeV2Page({
      shellHtml: SHELL,
      blockTypes: ['Header', 'Hero', 'Footer'],
      blocksHtml: [
        '<div class="w-full" data-puck-component-id="Header-1">H</div>',
        '<section data-puck-component-id="Hero-1">HERO</section>',
        '<footer data-puck-component-id="Footer-1">F</footer>',
      ],
      blockSchemes: [null, 'scheme-2', '3'],
      assetPrefix: null,
    });
    expect(html).toContain('<div class="color-scheme-2" data-block-scheme="2"><section data-puck-component-id="Hero-1">HERO</section></div>');
    expect(html).toContain('<div class="color-scheme-3" data-block-scheme="3"><footer data-puck-component-id="Footer-1">F</footer></div>');
    expect(html).not.toContain('color-scheme-1'); // Header без схемы — без обёртки
  });
});
