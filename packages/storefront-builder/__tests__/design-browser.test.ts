// «Дизайн по ссылке» в настоящем Chromium за фильтром: страница «публичного» сайта shop.test (на деле — локальный
// сервер, подмена `dial`) пытается достучаться до внутренних служб — http на 127.0.0.1, WebSocket на 127.0.0.1 и на
// имя, разрешающееся в 127.0.0.1, порт CDP браузера, порт 8080. Ни одна попытка не должна дойти. Пропускается, если
// браузера Playwright нет (`pnpm exec playwright install chromium`).
import { existsSync } from 'node:fs';
import { createServer as createHttp, type Server } from 'node:http';
import { createServer as createTcp, type AddressInfo, type Server as TcpServer } from 'node:net';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capture, type CaptureOptions } from '../src/design/design-capture';
import { tcpDial, type Dial } from '../src/design/design-egress';
import { DesignGuard, type HostLookup } from '../src/design/design-guard';
import { runDesign } from '../src/design/design-run';
import { DesignError } from '../src/design/design-types';
import { dembrandt } from '../src/design/tools/dembrandt';
import { designlang } from '../src/design/tools/designlang';
import { dom } from '../src/design/tools/dom';
import { own } from '../src/design/tools/own';

const hasChromium = existsSync(chromium.executablePath());
const PUBLIC_IP = '93.184.216.34';

const portOf = (server: Server | TcpServer): number => {
  const address: AddressInfo | string | null = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
};

let shop: Server;
let internal: Server;
let socketTrap: TcpServer;
let hits = 0;

const attacks = (): string => `
<script>
window.__attempts = Promise.all([
  fetch('http://127.0.0.1:${portOf(internal)}/fetch').then(() => 'дошло', () => 'отказ'),
  fetch('http://localtest.me:${portOf(internal)}/name').then(() => 'дошло', () => 'отказ'),
  fetch('http://shop.test:8080/port').then(() => 'дошло', () => 'отказ'),
  ...['ws://127.0.0.1:${portOf(socketTrap)}/', 'ws://localtest.me:${portOf(socketTrap)}/', 'ws://localtest.me/'].map((url) => new Promise((done) => {
    const ws = new WebSocket(url);
    ws.onopen = () => done('дошло');
    ws.onerror = () => done('отказ');
    setTimeout(() => done('отказ'), 3000);
  })),
]);
</script>`;

const PAGE = (): string => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Магазин шарфов</title>
<style>body{margin:0;font-family:Georgia,serif;color:#222}header{height:80px;background:#fff}
.hero{height:500px;background:#0f766e;color:#fff;padding:40px}.hero button{background:#ffcc00;color:#000;border:0;border-radius:12px;width:160px;height:44px}
.grid{display:flex;gap:20px;padding:40px;background:#f6f6f6}.card{width:200px;height:260px;background:#fff;border-radius:8px}
footer{height:200px;background:#111;color:#eee}</style></head><body>
<header><a href="/a">Каталог</a> <a href="/b">О нас</a> <a href="/c">Доставка</a></header>
<section class="hero"><h1>Тёплые шарфы</h1><p>Шерсть и кашемир на каждый день.</p><button>Купить</button></section>
<section class="grid">${[1, 2, 3, 4].map((n) => `<div class="card"><a href="/p${n}"><img src="https://cdn.example/p${n}.jpg" width="200" height="150" alt=""></a><h3>Шарф ${n}</h3><span>1 990 ₽</span></div>`).join('')}</section>
<footer><a href="/1">1</a><a href="/2">2</a><a href="/3">3</a><a href="/4">4</a><a href="/5">5</a></footer>
${attacks()}</body></html>`;

const lookup: HostLookup = (host) => {
  const table: Record<string, string> = { 'shop.test': PUBLIC_IP, 'localtest.me': '127.0.0.1' };
  const address = table[host];
  return address === undefined ? Promise.reject(new Error('ENOTFOUND')) : Promise.resolve([{ address, family: 4 }]);
};
const dial: Dial = (address, port) =>
  address === PUBLIC_IP ? tcpDial('127.0.0.1', portOf(shop)) : tcpDial(address, port);
const options = (): CaptureOptions => ({ guard: new DesignGuard({ lookup }), dial, pageTimeoutMs: 15_000 });

// Страница с картинкой, фоном, шрифтом и видео с того же сайта: шрифт и видео в браузере задания не грузятся, картинки —
// грузятся (`design-media.ts`).
const MEDIA_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Медиа</title><style>
@font-face{font-family:Brand;src:url(/m/brand.woff2) format("woff2")}
body{margin:0;font-family:Brand,Georgia,serif}header{height:80px}.hero{height:500px;background:#0f766e url(/m/bg.jpg);color:#fff}
.hero button{background:#ffcc00;border:0;border-radius:12px;width:160px;height:44px}footer{height:200px;background:#111}</style></head>
<body><header><a href="/a">Каталог</a> <a href="/b">О нас</a> <a href="/c">Доставка</a></header>
<section class="hero"><h1>Тёплые шарфы</h1><p>Шерсть и кашемир на каждый день.</p><button>Купить</button>
<img src="/m/photo.jpg" width="300" height="200" alt=""><video src="/m/clip.mp4" autoplay muted></video></section>
<footer><a href="/1">1</a><a href="/2">2</a><a href="/3">3</a><a href="/4">4</a><a href="/5">5</a></footer></body></html>`;

// Сколько раз сервер сайта отдал каждый адрес.
const served = new Map<string, number>();

const ROUTES: Record<string, (res: import('node:http').ServerResponse) => void> = {
  '/': (res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE()),
  '/media': (res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(MEDIA_PAGE),
  '/redirect': (res) => res.writeHead(302, { location: `http://127.0.0.1:${portOf(internal)}/secret` }).end(),
  '/denied': (res) => res.writeHead(403, { 'content-type': 'text/html' }).end('<title>Access denied</title>'),
  '/canvas': (res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        '<body style="margin:0"><canvas width="1366" height="900" style="width:100vw;height:100vh"></canvas></body>',
      ),
};

beforeAll(async () => {
  internal = createHttp((_, res) => {
    hits += 1;
    res.end('секрет');
  });
  socketTrap = createTcp((socket) => {
    hits += 1;
    socket.destroy();
  });
  shop = createHttp((req, res) => {
    const path = req.url ?? '/';
    served.set(path, (served.get(path) ?? 0) + 1);
    (ROUTES[path] ?? ROUTES['/'] ?? (() => res.end()))(res);
  });
  await Promise.all(
    [internal, socketTrap, shop].map(
      (server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve())),
    ),
  );
});

afterAll(async () => {
  await Promise.all([internal, socketTrap, shop].map((server) => new Promise((resolve) => server.close(resolve))));
});

async function failureOf(work: Promise<unknown>): Promise<DesignError> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DesignError) return error;
    throw error;
  }
  throw new Error('ожидался отказ');
}

describe.skipIf(!hasChromium)('«Дизайн по ссылке» · настоящий Chromium за фильтром', () => {
  it('страница не дотягивается до внутренних служб: http, имя → 127.0.0.1, WebSocket, порт 8080, CDP', async () => {
    const session = await capture(options(), 'http://shop.test/');
    try {
      const attempts = await session.captured.evaluate('window.__attempts', 10_000);
      expect(attempts).toEqual(['отказ', 'отказ', 'отказ', 'отказ', 'отказ', 'отказ']);
      const cdp = await session.captured.evaluate(
        `fetch('${session.captured.cdp}/json/version').then(() => 'дошло', () => 'отказ')`,
      );
      expect(cdp).toBe('отказ');
      expect(session.captured.title).toBe('Магазин шарфов');
      expect(session.captured.dom.length).toBeGreaterThanOrEqual(3);
    } finally {
      await session.close();
    }
    expect(hits).toBe(0);
  }, 60_000);

  it('редирект на внутренний адрес — blocked, до внутренней службы не дошло', async () => {
    expect((await failureOf(capture(options(), 'http://shop.test/redirect'))).code).toBe('blocked');
    expect(hits).toBe(0);
  }, 60_000);

  it('внутренний адрес, localhost и порт не 80/443 — blocked ещё до браузера', async () => {
    expect((await failureOf(capture(options(), `http://127.0.0.1:${portOf(internal)}/`))).code).toBe('blocked');
    expect((await failureOf(capture(options(), 'http://localtest.me/'))).code).toBe('blocked');
    expect((await failureOf(capture(options(), 'http://shop.test:8080/'))).code).toBe('blocked');
    expect((await failureOf(capture(options(), 'http://nowhere.test/'))).code).toBe('unreachable');
    expect(hits).toBe(0);
  });

  it('403 — защита от ботов; холст во весь экран — canvas', async () => {
    expect((await failureOf(capture(options(), 'http://shop.test/denied'))).code).toBe('bot-protection');
    expect((await failureOf(capture(options(), 'http://shop.test/canvas'))).code).toBe('canvas');
  }, 60_000);

  it('снятие целиком (own + dom, свой сайт): стиль, контур и содержимое в формате контракта', async () => {
    const snapshot = await runDesign(
      { capture: (url) => capture(options(), url), style: [own], outline: [dom], now: () => Date.now() },
      { url: 'http://shop.test/', owned: true, deadline: Date.now() + 50_000 },
    );
    expect(snapshot).toMatchObject({ v: 1, ok: true, tool: 'own', outlineTool: 'dom' });
    expect(snapshot.style.bands.map((band) => band.bg)).toContain('#0f766e');
    expect(snapshot.style.fonts.body).toMatchObject({ family: 'Georgia', category: 'serif', source: 'system' });
    expect(snapshot.style.radius.button).toBe(12);
    const roles = snapshot.outline.blocks.map((block) => block.role);
    expect(roles[0]).toBe('header');
    expect(roles).toContain('product-grid');
    expect(roles.at(-1)).toBe('footer');
    expect(snapshot.content?.blocks.length).toBe(snapshot.outline.blocks.length);
    expect(snapshot.content?.blocks.flatMap((block) => block.images)).toContain('https://cdn.example/p1.jpg');
    expect(snapshot.content?.menu.map((item) => item.label)).toContain('Каталог');
    expect(hits).toBe(0);
  }, 60_000);

  it('настоящие dembrandt и designlang работают по вкладке захвата: страница загружена один раз, видео и шрифт — нет', async () => {
    served.clear();
    const snapshot = await runDesign(
      {
        capture: (url) => capture(options(), url),
        style: [dembrandt, own],
        outline: [designlang, dom],
        now: () => Date.now(),
      },
      { url: 'http://shop.test/media', owned: false, deadline: Date.now() + 80_000 },
    );
    expect(snapshot).toMatchObject({ ok: true, tool: 'dembrandt', outlineTool: 'designlang' });
    expect(snapshot.raw.errors).toBeUndefined();
    expect(snapshot.style.fonts.body.family).toBe('Brand');
    expect(snapshot.style.radius.button).toBe(12);
    expect(served.get('/media')).toBe(1);
    expect(served.get('/m/brand.woff2')).toBeUndefined();
    expect(served.get('/m/clip.mp4')).toBeUndefined();
    expect(served.get('/m/photo.jpg')).toBe(1);
    expect(hits).toBe(0);
  }, 90_000);
});
