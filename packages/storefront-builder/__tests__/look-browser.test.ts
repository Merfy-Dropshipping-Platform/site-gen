// Снимок черновика в настоящем Chromium на фикстуре HTML (перенесено 28.10 из merfy-mcp
// `tests/server/nova-look-browser.spec.ts`). Пропускается, если браузера Playwright нет (`pnpm exec playwright install
// chromium`); сети тесты не требуют: адрес страницы — запасной (зона `.invalid`), а внутренние адреса фильтр режет до сети.
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { ChromiumRenderer } from '../src/look/look-browser';
import { LOOK_PATTERN, runLookJob } from '../src/look/look-job';

const hasChromium = existsSync(chromium.executablePath());

const FIXTURE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;font-family:sans-serif}
h1{font-size:44px;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;color:transparent}
.card{border-left:6px solid #7c3aed;border-radius:12px;padding:20px;margin:20px}
.wide{width:900px;height:20px;background:#c00}
.tall{height:2600px;background:linear-gradient(#fff,#999)}
</style></head><body>
<h1>Тёплые шарфы</h1>
<div class="card"><p>Первая</p></div><div class="card"><p>Вторая</p></div><div class="card"><p>Третья</p></div>
<img src="/missing.png" width="50" height="50" alt="">
<script>console.error('Ошибка из страницы')</script>
<div class="wide"></div><div class="tall"></div>
</body></html>`;

const isJpeg = (bytes: Uint8Array): boolean => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.length > 1_000;

describe.skipIf(!hasChromium)('снимок черновика · настоящий Chromium', () => {
  const renderer = new ChromiumRenderer();
  afterAll(() => renderer.close());

  it('измеряет страницу, снимает экраны JPEG и находит признаки ИИ-дизайна', async () => {
    const rendered = await renderer.open({ html: FIXTURE, devices: ['mobile', 'desktop'] });
    try {
      const [mobile, desktop] = rendered.sessions;
      if (mobile === undefined || desktop === undefined) throw new Error('нет экранов');
      expect(desktop.facts.pageHeight).toBeGreaterThan(2_600);
      expect(desktop.facts.brokenImages).toBe(1);
      expect(desktop.facts.consoleErrors).toContain('Ошибка из страницы');
      expect(desktop.facts.sideScroll).toBe(false);
      // Ширина 900 px на экране телефона в 390 px — страница шире экрана.
      expect(mobile.facts.sideScroll).toBe(true);

      const first = await desktop.shoot(0, 70);
      const second = await desktop.shoot(1, 70);
      expect(isJpeg(first)).toBe(true);
      expect(isJpeg(second)).toBe(true);
      expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);

      const rules = (await desktop.detect()).map((finding) => finding.rule);
      expect(rules).toContain('gradient-text');
      expect(rules).toContain('side-tab');
    } finally {
      await rendered.close();
    }
  }, 60_000);

  it('задание целиком: факты, находки, картинки по экранам, телефон первым', async () => {
    const reply = await runLookJob(
      {
        renderer,
        fetch: () => Promise.resolve(new Response(FIXTURE, { headers: { 'content-type': 'text/html' } })),
        sitesUrl: 'http://sites',
        log: () => undefined,
        now: () => Date.now(),
      },
      {
        pattern: LOOK_PATTERN,
        data: { v: 1, siteId: 's1', page: 'home', devices: 'both', full: true, deadline: Date.now() + 55_000 },
      },
    );

    if (!reply.ok) throw new Error(reply.error.message);
    const [mobile, desktop] = reply.snapshot.devices;
    expect([mobile?.device, desktop?.device]).toEqual(['mobile', 'desktop']);
    expect(mobile?.facts.sideScroll).toBe(true);
    expect(desktop?.facts.brokenImages).toBe(1);
    expect(reply.snapshot.findings.map((finding) => finding.code)).toContain('gradient-text');
    expect(reply.snapshot.findings.every((finding) => finding.device === 'mobile')).toBe(true);
    const images = reply.snapshot.devices.flatMap((device) => device.images);
    expect(images.length).toBeGreaterThan(4);
    for (const image of images) expect(isJpeg(Buffer.from(image, 'base64'))).toBe(true);
  }, 60_000);

  it('снимок секции: детектор отдаёт находки только её элементов, даже если селекторы у секций одинаковые', async () => {
    // Две секции с одной разметкой: селектор `h2` и `div > section > div` подходит к элементам обеих. Боковая полоса — только
    // в первой, градиентный заголовок — в обеих, у третьей секции (пустая) находок нет.
    const heading =
      '<h2 style="background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;color:transparent;font-size:36px;margin:0">Заголовок</h2>';
    const card =
      '<div style="border-left:6px solid #7c3aed;border-radius:12px;padding:16px;margin:12px 0">Карточка</div>';
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;font-family:sans-serif">
<div data-section-id="first-1"><section style="padding:24px">${heading}${card}</section></div>
<div data-section-id="second-2"><section style="padding:24px">${heading}</section></div>
<div data-section-id="empty-3"><section style="padding:24px"><p style="font-size:16px;color:#222">Просто текст</p></section></div>
</body></html>`;
    const look = async (section: string) => {
      const reply = await runLookJob(
        {
          renderer,
          fetch: () => Promise.resolve(new Response(html, { headers: { 'content-type': 'text/html' } })),
          sitesUrl: 'http://sites',
          log: () => undefined,
          now: () => Date.now(),
        },
        {
          pattern: LOOK_PATTERN,
          data: {
            v: 1,
            siteId: 's1',
            page: 'home',
            devices: 'mobile',
            full: false,
            section,
            deadline: Date.now() + 55_000,
          },
        },
      );
      if (!reply.ok) throw new Error(reply.error.message);
      return reply.snapshot;
    };

    const first = await look('first-1');
    const second = await look('second-2');
    const empty = await look('empty-3');

    expect(first.detector).toEqual({ ok: true });
    expect(first.findings.map((finding) => finding.code).sort()).toEqual(['gradient-text', 'side-tab']);
    expect(second.findings.map((finding) => finding.code)).toEqual(['gradient-text']);
    expect(empty.detector).toEqual({ ok: true });
    expect(empty.findings.filter((finding) => finding.source === 'impeccable')).toEqual([]);
    // Форма находки — как у снимка страницы.
    expect(second.findings[0]).toMatchObject({ source: 'impeccable', device: 'mobile', section: null, clip: null });
  }, 60_000);

  it('страница не достаёт до внутренних адресов сервера', async () => {
    let hits = 0;
    const server: Server = createServer((_request, response) => {
      hits += 1;
      response.end('секрет');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const html = `<!doctype html><html><body><img src="http://127.0.0.1:${port}/a.png" width="10" height="10">
<script>fetch('http://127.0.0.1:${port}/b').catch(() => {})</script></body></html>`;
    try {
      const rendered = await renderer.open({ html, devices: ['desktop'] });
      try {
        expect(rendered.sessions[0]?.facts.brokenImages).toBe(1);
      } finally {
        await rendered.close();
      }
      expect(hits).toBe(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, 60_000);

  it('страница корзины: строки товаров магазина подставлены вместо пустой корзины, шлюз не зовётся', async () => {
    const lines = [1, 2].map((n) => ({
      id: `look-line-${n}`,
      productId: `p${n}`,
      variantCombinationId: null,
      quantity: 1,
      unitPriceCents: 1000 * n,
      name: `Товар ${n}`,
      imageUrl: null,
      options: {},
    }));
    // Страница читает корзину так же, как ядро витрины: номер — из адреса `?merfy-cart=`, строки — `GET <шлюз>/store/carts/<номер>`.
    const cartPage = (sample: string) => `<!doctype html><html><head>
<script type="application/json" id="merfy-config">{"shop":{"url":"https://shop.example.com/"}}</script></head><body><h1>Корзина</h1>
${sample}
<script>
const id = new URLSearchParams(location.search).get('merfy-cart');
fetch('https://api.example.com/store/carts/' + id)
  .then((r) => r.json())
  .then((body) => console.error('CART:' + body.items.map((i) => i.name + ' x' + i.quantity).join('|') + ';' + body.cart.totalCents))
  .catch((e) => console.error('CART-FAIL:' + e.message));
</script></body></html>`;
    const tag = `<script type="application/json" id="merfy-look-sample">${JSON.stringify({ v: 1, cart: { lines } })}</script>`;

    const withCart = await renderer.open({ html: cartPage(tag), devices: ['desktop'] });
    const without = await renderer.open({ html: cartPage(''), devices: ['desktop'] });
    try {
      expect(withCart.sessions[0]?.facts.consoleErrors).toContain('CART:Товар 1 x1|Товар 2 x1;3000');
      // Без тега превью корзина не подменяется: запрос идёт к настоящему адресу и здесь, без сети, падает.
      const failed = without.sessions[0]?.facts.consoleErrors ?? [];
      expect(failed.some((text) => text.startsWith('CART:'))).toBe(false);
    } finally {
      await withCart.close();
      await without.close();
    }
  }, 60_000);

  it('срок вышел — отказ timeout, место в очереди освобождено', async () => {
    const short = new ChromiumRenderer({ timeoutMs: 1, maxConcurrent: 1 });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await expect(short.open({ html: FIXTURE, devices: ['desktop'] })).rejects.toMatchObject({
          code: 'timeout',
          message: 'Не успел отрисовать страницу за 0 с',
        });
      }
    } finally {
      await short.close();
    }
  }, 60_000);
});

describe('снимок черновика · браузер не запустился', () => {
  it('отказ no-browser; повторный вызов не виснет', async () => {
    const missing = new ChromiumRenderer({ executablePath: '/nonexistent/chromium', maxConcurrent: 1 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(missing.open({ html: FIXTURE, devices: ['desktop'] })).rejects.toMatchObject({ code: 'no-browser' });
    }
  });
});
