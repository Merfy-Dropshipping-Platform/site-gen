// Снимок черновика: одна страница в Chromium (перенесено 28.10 из merfy-mcp `src/nova/look-page.ts`; поправки — zod 4
// и пути пакета). Открывает HTML превью на адресе магазина, ждёт, пока страница догрузится, измеряет её, снимает экраны
// и запускает детектор Impeccable (`vendor/impeccable/`).
//
// Про детектор (разобрано по `crates/live` и `browser-bundle/50-scan.js` из pbakaus/impeccable, коммит 8409a56): скрипт
// записывает в окно страницы `impeccableDetectAsync()`. Он считает правила в WASM-ядре на живом DOM и без рисования
// поверх страницы возвращает группы находок по элементам; находки уровня страницы идут группой с `isPageLevel`.
// Автозапуск выключен `window.__IMPECCABLE_CONFIG__ = { autoScan: false }` — страницу он не трогает и в снимки не
// попадает, потому что запускается после них.
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page, Route } from 'playwright';
import { z } from 'zod';
import { isAllowedRequest } from './look-guard';
import { VIEWPORTS, type DetectorFinding, type LookDevice, type PageFacts, type PageSession } from './look-types';

// Запасной адрес для превью без разбираемого `merfy-config`: имя в зоне `.invalid` никогда не разрешается в сеть.
const FALLBACK_ORIGIN = 'https://preview.merfy.invalid';
const QUIET_NETWORK_MS = 5_000;
const SCROLL_PAUSE_MS = 80;
const MAX_SCROLL_STEPS = 40;
const SHOT_SETTLE_MS = 150;

const CONFIG_SCRIPT = /<script[^>]*\bid="merfy-config"[^>]*>([\s\S]*?)<\/script>/;
const ShopConfig = z.object({ shop: z.object({ url: z.url() }) });

function parseConfig(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Адрес, на котором страница откроется: `shop.url` из `merfy-config`. Картинки, шрифты и относительные ссылки так
// разрешаются от адреса магазина, как у витрины. Нет конфига или он не разбирается — запасной адрес: страница всё равно
// отрисуется, только относительные ссылки не загрузятся (это видно по битым картинкам в ответе).
export function entryUrlOf(html: string): string {
  const raw = CONFIG_SCRIPT.exec(html)?.[1];
  const parsed = raw === undefined ? null : ShopConfig.safeParse(parseConfig(raw));
  if (!parsed?.success) return `${FALLBACK_ORIGIN}/`;
  const url = new URL(parsed.data.shop.url);
  return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.origin}/` : `${FALLBACK_ORIGIN}/`;
}

let detectorSource: string | undefined;
function detectorScript(): string {
  detectorSource ??= readFileSync(
    new URL('../../vendor/impeccable/detect-antipatterns-browser.js', import.meta.url),
    'utf8',
  );
  return detectorSource;
}

const DetectorOutput = z.array(
  z.object({
    findings: z.array(z.object({ type: z.string(), name: z.string().optional(), detail: z.string().optional() })),
  }),
);

function entryRoute(entry: string, html: string): (route: Route) => Promise<void> {
  return async (route) => {
    const url = route.request().url();
    if (url === entry) {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return;
    }
    if (!isAllowedRequest(url)) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  };
}

interface Collector {
  errors: string[];
  failedImages: Set<string>;
}

function collect(page: Page): Collector {
  const collector: Collector = { errors: [], failedImages: new Set() };
  page.on('console', (message) => {
    if (message.type() === 'error') collector.errors.push(message.text());
  });
  page.on('pageerror', (error) => collector.errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'image') collector.failedImages.add(request.url());
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image' && response.status() >= 400)
      collector.failedImages.add(response.url());
  });
  return collector;
}

// Ожидание тишины в сети: страница с постоянными запросами тишины не дождётся, это не ошибка.
async function waitForQuiet(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout: QUIET_NETWORK_MS });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
  }
}

// Прокручивает страницу до конца шагами в экран: так грузятся отложенные картинки и срабатывают появления по прокрутке.
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(
    async ({ pause, maxSteps }) => {
      const step = window.innerHeight;
      const end = Math.min(document.documentElement.scrollHeight, step * maxSteps);
      for (let y = 0; y < end; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
      window.scrollTo(0, 0);
    },
    { pause: SCROLL_PAUSE_MS, maxSteps: MAX_SCROLL_STEPS },
  );
}

async function measure(page: Page, collector: Collector): Promise<PageFacts> {
  const dom = await page.evaluate(() => {
    const root = document.documentElement;
    // SVG без своего размера в `<img>` даёт naturalWidth 0 при полной загрузке — битой её не считаем.
    const broken = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0 && image.currentSrc !== '')
      .map((image) => image.currentSrc)
      .filter((src) => !src.startsWith('data:') && !/\.svg(\?|#|$)/i.test(src));
    return {
      pageHeight: Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0),
      sideScroll: root.scrollWidth > root.clientWidth,
      broken,
    };
  });
  const brokenImages = new Set([...dom.broken, ...collector.failedImages]).size;
  return { pageHeight: dom.pageHeight, sideScroll: dom.sideScroll, brokenImages, consoleErrors: collector.errors };
}

async function runDetector(page: Page): Promise<DetectorFinding[]> {
  await page.evaluate(() => Object.assign(window, { __IMPECCABLE_CONFIG__: { autoScan: false } }));
  await page.addScriptTag({ content: detectorScript() });
  const raw: unknown = await page.evaluate(async () => {
    const detect: unknown = Reflect.get(window, 'impeccableDetectAsync');
    if (typeof detect !== 'function') throw new Error('детектор не подключился');
    const found: unknown = await detect.call(window);
    return found;
  });
  const groups = DetectorOutput.parse(raw);
  return groups.flatMap((group) =>
    group.findings.map((finding) => ({
      rule: finding.type,
      name: finding.name ?? finding.type,
      detail: finding.detail ?? '',
    })),
  );
}

// Открывает страницу под нужный экран и возвращает её готовой к снимкам. Контекст закрывает вызывающий.
export async function openPage(context: BrowserContext, device: LookDevice, html: string): Promise<PageSession> {
  const viewport = VIEWPORTS[device];
  const entry = entryUrlOf(html);
  await context.route('**/*', entryRoute(entry, html));
  const page = await context.newPage();
  const collector = collect(page);

  await page.goto(entry, { waitUntil: 'load' });
  await waitForQuiet(page);
  await scrollThrough(page);
  await waitForQuiet(page);
  await page.evaluate(() => document.fonts.ready);
  const facts = await measure(page, collector);

  return {
    device,
    viewport,
    facts,
    async shoot(index, quality) {
      await page.evaluate((y) => window.scrollTo(0, y), index * viewport.height);
      await page.waitForTimeout(SHOT_SETTLE_MS);
      return page.screenshot({ type: 'jpeg', quality, animations: 'disabled' });
    },
    detect: () => runDetector(page),
  };
}
