import { createServer } from 'node:net';
import type { Browser, BrowserContext, Page, Response } from 'playwright';
import { pageScript } from './design-scripts';
import { DesignEgress, REFUSED_HEADER, type Dial } from './design-egress';
import { AddressRefused, REFUSED_NAME, type DesignGuard } from './design-guard';
import { skipMedia } from './design-media';
import { DesignError, type DesignErrorCode } from './design-types';
import { parseDom, parseProbe, type DomBlock, type PageProbe } from './design-dom';

// Захват чужой страницы для «Дизайна по ссылке» (раздел 2 контракта). На задание — свой процесс Chromium (тот, что в
// образе Playwright) со своим фильтром: весь трафик страницы, даже к 127.0.0.1, идёт через `DesignEgress`
// (`--proxy-server`, `--proxy-bypass-list=<-loopback>`), поэтому страница не дотянется ни до порта CDP, ни до сети
// контейнера. WebRTC без прокси выключен (иначе UDP мимо фильтра). Порт CDP слушает только 127.0.0.1: к нему подключаются
// переходники dembrandt и designlang (`tools/`) и работают по этой же вкладке (`target`), второй раз сайт не грузят.
// Видео и шрифты в браузере задания не грузятся (`design-media.ts`). После задания браузер закрывается:
// снимки черновика (`look/`) и дизайн друг друга не ждут и не делят браузер.

const SCREEN = { width: 1366, height: 900 };
// После DOMContentLoaded ждём событие load не дольше: тишины в сети магазины не дают (аналитика), а dembrandt и так
// ждёт стабильности страницы сам. Дальше — прокрутка за ленивыми блоками.
const LOAD_MS = 3_000;
const FULL_MAX_HEIGHT = 8_000;
const PAGE_TIMEOUT_MS = 30_000;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-quic',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-background-networking',
  '--disable-component-update',
  '--no-first-run',
  '--hide-scrollbars',
  '--mute-audio',
];

// RTCPeerConnection в наших вкладках нет: адреса ICE ушли бы UDP мимо прокси (флаг выше закрывает это и в чужих).
const NO_WEBRTC = `for (const k of ['RTCPeerConnection','webkitRTCPeerConnection']) { try { delete window[k]; } catch {} }`;

const SCROLL = `(async () => {
  const max = Math.min(document.documentElement.scrollHeight, 30000);
  for (let y = 0; y < max; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
  return document.documentElement.scrollHeight;
})()`;

export interface Captured {
  url: string;
  finalUrl: string;
  title: string;
  status: number | null;
  // http://127.0.0.1:<порт> браузера и targetId вкладки — для переходников по CDP.
  cdp: string;
  target: string;
  proxy: string;
  height: number;
  dom: DomBlock[];
  google: string[];
  evaluate: (script: string, timeoutMs?: number) => Promise<unknown>;
  shot: () => Promise<{ screen: Buffer; full: Buffer }>;
}

export interface CaptureOptions {
  guard: DesignGuard;
  executablePath?: string;
  // Только тесты: куда на самом деле соединяться по проверенному адресу.
  dial?: Dial;
  pageTimeoutMs?: number;
  onRefused?: (host: string, reason: string) => void;
}

export interface Session {
  captured: Captured;
  close: () => Promise<void>;
}

// Признаки защиты от ботов в заголовке и разметке. Срабатывают только на почти пустой странице: reCAPTCHA в форме
// обычного магазина — не защита от ботов.
const BOT_MARKERS = [
  /cf-chl|challenge-platform|cf_chl_opt/i,
  /ddos-guard/i,
  /qrator/i,
  /just a moment|attention required|проверка браузера|access denied|доступ ограничен/i,
  /captcha/i,
];
const BOT_STATUSES = new Set([401, 403, 429, 503]);
const BOT_TEXT_MAX = 1500;
const CANVAS_SHARE = 0.5;
const CANVAS_TEXT_MAX = 300;

export function pageProblem(
  status: number | null,
  probe: PageProbe,
): { code: DesignErrorCode; message: string } | null {
  const marked = BOT_MARKERS.some((marker) => marker.test(`${probe.title}\n${probe.html}`));
  const checks: Array<[boolean, DesignErrorCode, string]> = [
    [status !== null && BOT_STATUSES.has(status), 'bot-protection', `Сайт не пустил (ответ ${status ?? ''})`],
    [marked && probe.textLength < BOT_TEXT_MAX, 'bot-protection', 'Сайт показал проверку от ботов'],
    [status !== null && status >= 400, 'unreachable', `Сайт ответил ${status ?? ''}`],
    [
      probe.canvas >= CANVAS_SHARE && probe.textLength < CANVAS_TEXT_MAX,
      'canvas',
      'Сайт нарисован на холсте: стиль снять нельзя',
    ],
  ];
  const found = checks.find(([hit]) => hit);
  return found === undefined ? null : { code: found[1], message: found[2] };
}

// Почему не открылась главная: фильтр отказал (в том числе на шаге редиректа) — blocked, срок — timeout, иначе сайт
// не ответил.
export function navigationProblem(error: unknown, refused: boolean): DesignError {
  const text = String(error);
  if (refused) return new DesignError('blocked', 'Этот адрес открыть нельзя', { cause: error });
  if (/Timeout/i.test(text))
    return new DesignError('timeout', 'Сайт не открылся за отведённое время', { cause: error });
  return new DesignError('unreachable', 'Сайт не отвечает', { cause: error });
}

async function precheck(guard: DesignGuard, url: string): Promise<void> {
  try {
    await guard.checkUrl(url);
  } catch (error) {
    const refused = error instanceof AddressRefused && error.reason !== REFUSED_NAME;
    if (refused) throw new DesignError('blocked', `Этот адрес открыть нельзя: ${error.reason}`);
    throw new DesignError('unreachable', 'Имя сайта не разрешилось', { cause: error });
  }
}

// Свободный порт на 127.0.0.1 для CDP браузера задания.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('порт CDP не выдался'))));
    });
  });
}

async function launch(options: CaptureOptions, proxy: string): Promise<{ browser: Browser; cdp: string }> {
  const { chromium } = await import('playwright');
  const port = await freePort();
  const browser = await chromium.launch({
    headless: true,
    args: [
      ...LAUNCH_ARGS,
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
      `--proxy-server=${proxy}`,
      '--proxy-bypass-list=<-loopback>',
    ],
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
  });
  await skipMedia(browser);
  return { browser, cdp: `http://127.0.0.1:${port}` };
}

// targetId вкладки в CDP: по нему скрипты инструментов находят её среди вкладок браузера (`node/borrow.mjs`).
async function targetOf(context: BrowserContext, page: Page): Promise<string> {
  const session = await context.newCDPSession(page);
  try {
    const info: { targetInfo: { targetId: string } } = await session.send('Target.getTargetInfo');
    return info.targetInfo.targetId;
  } finally {
    await session.detach().catch(() => undefined);
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, text: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DesignError('timeout', text)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

async function open(page: Page, url: string, timeoutMs: number, egress: DesignEgress): Promise<Response | null> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const refusedByProxy = response?.headers()[REFUSED_HEADER] === 'refused';
    if (refusedByProxy) throw new DesignError('blocked', 'Этот адрес открыть нельзя');
    return response;
  } catch (error) {
    if (error instanceof DesignError) throw error;
    throw navigationProblem(error, egress.refusals.length > 0);
  }
}

async function settle(page: Page): Promise<number> {
  await page.waitForLoadState('load', { timeout: LOAD_MS }).catch(() => undefined);
  const height: unknown = await page.evaluate(SCROLL).catch(() => 0);
  return typeof height === 'number' ? height : 0;
}

function capturedOf(
  page: Page,
  url: string,
  response: Response | null,
  probe: PageProbe,
  extra: Pick<Captured, 'cdp' | 'target' | 'proxy' | 'height' | 'dom'>,
): Captured {
  return {
    url,
    finalUrl: page.url(),
    title: probe.title,
    status: response?.status() ?? null,
    google: probe.google,
    ...extra,
    evaluate: (script, timeoutMs = 15_000) =>
      withTimeout(page.evaluate(script), timeoutMs, 'Скрипт страницы не уложился в срок'),
    shot: async () => ({
      screen: await page.screenshot({ type: 'jpeg', quality: 70 }),
      full: await page.screenshot({
        type: 'jpeg',
        quality: 60,
        fullPage: true,
        clip: { x: 0, y: 0, width: SCREEN.width, height: Math.min(Math.max(extra.height, 1), FULL_MAX_HEIGHT) },
      }),
    }),
  };
}

async function snap(
  context: BrowserContext,
  url: string,
  egress: DesignEgress,
  timeoutMs: number,
  links: Pick<Captured, 'cdp' | 'proxy'>,
): Promise<Captured> {
  const page = await context.newPage();
  const target = await targetOf(context, page);
  const response = await open(page, url, timeoutMs, egress);
  const height = await settle(page);
  const probe = parseProbe(await page.evaluate(pageScript('probe')));
  const problem = pageProblem(response?.status() ?? null, probe);
  if (problem !== null) throw new DesignError(problem.code, problem.message);
  const contour = parseDom(await page.evaluate(pageScript('contour')));
  const extra = { ...links, target, height: contour.height || height, dom: contour.blocks };
  return capturedOf(page, url, response, probe, extra);
}

// Открыть страницу через фильтр и снять контур. Сессия живёт, пока по странице работают переходники; close — всегда.
export async function capture(options: CaptureOptions, url: string): Promise<Session> {
  await precheck(options.guard, url);
  const egress = new DesignEgress(options.guard, {
    ...(options.dial ? { dial: options.dial } : {}),
    onRefused: (refusal) => options.onRefused?.(refusal.host, refusal.reason),
  });
  const proxy = await egress.start();
  let browser: Browser | undefined;
  const close = async (): Promise<void> => {
    await browser?.close().catch(() => undefined);
    await egress.close();
  };
  try {
    const launched = await launch(options, proxy);
    browser = launched.browser;
    const context = await browser.newContext({ viewport: SCREEN, locale: 'ru-RU', serviceWorkers: 'block' });
    await context.addInitScript(NO_WEBRTC);
    const links = { cdp: launched.cdp, proxy };
    const captured = await snap(context, url, egress, options.pageTimeoutMs ?? PAGE_TIMEOUT_MS, links);
    return { captured, close };
  } catch (error) {
    await close();
    throw error;
  }
}
