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
import { layoutSource, parseLayout } from './look-layout';
import {
  VIEWPORTS,
  type DetectorFinding,
  type LayoutFinding,
  type LookDevice,
  type PageFacts,
  type PageSession,
  type SectionPlace,
  type Viewport,
} from './look-types';

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

// Детектор отдаёт группы по элементам: `selector` (не привязан к документу: `div:nth-of-type(1) > section > div` подходит
// к элементам разных секций), `rect` (getBoundingClientRect на момент запуска), `isPageLevel`. Самого элемента в ответе нет,
// поэтому принадлежность секции определяется в странице, сразу после запуска (пока `rect` совпадает с живыми рамками):
// 1) находка уровня страницы в секцию не входит; 2) среди элементов по `selector` берутся те, чья рамка совпала с `rect`
// (до 1,5 px), и находка принадлежит секции, если один из них лежит внутри её обёртки; 3) нет такого элемента (селектор
// не разобрался) — по рамке: центр `rect` внутри места секции (рамка обёртки, а у обёртки без рамки — объединение
// видимых потомков, как в `LOCATE_SCRIPT`).
const DETECT_IN_SECTION_BODY = `async (find, id) => {
  const detect = window.impeccableDetectAsync;
  if (typeof detect !== 'function') throw new Error('детектор не подключился');
  const groups = await detect.call(window);
  const wrapper = find(id);
  if (!wrapper) return [];
  const sized = (rect) => rect.width >= 1 && rect.height >= 1;
  const own = wrapper.getBoundingClientRect();
  const boxes = sized(own)
    ? [own]
    : [...wrapper.querySelectorAll('*')].map((node) => node.getBoundingClientRect()).filter(sized);
  const area = {
    left: Math.min(...boxes.map((rect) => rect.left)),
    top: Math.min(...boxes.map((rect) => rect.top)),
    right: Math.max(...boxes.map((rect) => rect.right)),
    bottom: Math.max(...boxes.map((rect) => rect.bottom)),
  };
  const same = (rect, node) => {
    const live = node.getBoundingClientRect();
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(live[key] - rect[key]) <= 1.5);
  };
  return groups.filter((group) => {
    if (group.isPageLevel) return false;
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll(group.selector)].filter((node) => same(group.rect, node));
    } catch {
      nodes = [];
    }
    if (nodes.length > 0) return nodes.some((node) => wrapper.contains(node));
    if (boxes.length === 0) return false;
    const x = group.rect.left + group.rect.width / 2;
    const y = group.rect.top + group.rect.height / 2;
    return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  });
}`;

const detectInSectionScript = (section: string): string =>
  `(${DETECT_IN_SECTION_BODY})(${SECTION_FINDER}, ${JSON.stringify(section)})`;

async function runDetector(page: Page, section?: string): Promise<DetectorFinding[]> {
  await page.evaluate(() => Object.assign(window, { __IMPECCABLE_CONFIG__: { autoScan: false } }));
  await page.addScriptTag({ content: detectorScript() });
  const raw: unknown =
    section === undefined
      ? await page.evaluate(async () => {
          const detect: unknown = Reflect.get(window, 'impeccableDetectAsync');
          if (typeof detect !== 'function') throw new Error('детектор не подключился');
          const found: unknown = await detect.call(window);
          return found;
        })
      : await page.evaluate(detectInSectionScript(section));
  const groups = DetectorOutput.parse(raw);
  return groups.flatMap((group) =>
    group.findings.map((finding) => ({
      rule: finding.type,
      name: finding.name ?? finding.type,
      detail: finding.detail ?? '',
    })),
  );
}

// Проверки вёрстки (`browser/layout-checks.js`) на отрисованной странице нужного устройства.
async function runLayout(page: Page, device: LookDevice, section?: string): Promise<LayoutFinding[]> {
  // Строку Playwright только вычисляет, функцию из неё с аргументом не зовёт — вызов пишем сами.
  const options = section === undefined ? { device } : { device, section };
  const raw: unknown = await page.evaluate(`(${layoutSource()})(${JSON.stringify(options)})`);
  return parseLayout(raw);
}

// Секция в странице по id экземпляра. Сравнение — в коде, а не в селекторе: id приходит снаружи.
const SECTION_FINDER = `
  (id) => [...document.querySelectorAll('[data-section-id]')].find((node) => node.getAttribute('data-section-id') === id)
`;

// Высота, выше которой секция на снимке обрезается: две-три высоты экрана телефона — больше не нужно, вес растёт.
export const SECTION_MAX_HEIGHT = 1_600;

const RawPlaceShape = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  pinned: z.boolean(),
});

// Скрипт страницы: место секции после прокрутки в начало. У обёртки секции нет своей рамки (баннер cookie: внутри
// `fixed`, сама она высотой 0) — берётся объединение видимых потомков. Прибита к экрану, если и сама обёртка, и все
// потомки с рамкой — `fixed` или `sticky` (сама или через предка): координаты тогда экранные, а на нулевой прокрутке
// они же страничные.
const LOCATE_SCRIPT = (section: string): string => `((find, id) => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const wrapper = find(id);
  if (!wrapper) return null;
  const sized = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  };
  const pinnedUp = (node) => {
    for (let at = node; at && at !== document.documentElement; at = at.parentElement) {
      const position = getComputedStyle(at).position;
      if (position === 'fixed' || position === 'sticky') return true;
    }
    return false;
  };
  const boxes = sized(wrapper)
    ? [wrapper]
    : [...wrapper.querySelectorAll('*')].filter((node) => sized(node) && node.checkVisibility());
  if (boxes.length === 0 || !wrapper.checkVisibility()) return null;
  const rects = boxes.map((node) => node.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top, pinned: boxes.every(pinnedUp) };
})(${SECTION_FINDER}, ${JSON.stringify(section)})`;

async function locateSection(page: Page, viewport: Viewport, section: string): Promise<SectionPlace | null> {
  const raw: unknown = await page.evaluate(LOCATE_SCRIPT(section));
  if (raw === null) return null;
  const place = RawPlaceShape.parse(raw);
  // В кадр: не шире экрана, левее нуля не выходит; у прибитой — и не ниже экрана. Обрезка по высоте — от верха секции.
  const x = Math.max(0, Math.floor(place.x));
  const right = Math.min(viewport.width, Math.ceil(place.x + place.width));
  const height = Math.max(1, Math.ceil(place.height));
  const capped = Math.min(SECTION_MAX_HEIGHT, place.pinned ? Math.min(height, viewport.height) : height);
  return {
    x,
    y: Math.max(0, Math.floor(place.y)),
    width: Math.max(1, right - x),
    height: capped,
    fullHeight: height,
    pinned: place.pinned,
  };
}

// Снимок секции. Прибитая к экрану — без прокрутки, как есть (её высота не больше экрана). Остальные: страница
// прокручивается к верху секции, липкие и плавающие чужие элементы (шапка, баннер, кнопка) на время снимка скрываются —
// иначе они закрыли бы верх секции, — и снимается область страницы `clip` в координатах документа (`fullPage`): так
// секция выше экрана телефона попадает в кадр целиком, а без `fullPage` Playwright обрезал бы её по высоте экрана.
async function shootSection(page: Page, place: SectionPlace, section: string, quality: number): Promise<Uint8Array> {
  await page.evaluate(
    `((find, id, top, pinned) => {
      window.scrollTo({ top: pinned ? 0 : top, left: 0, behavior: 'instant' });
      const wrapper = find(id);
      if (wrapper && !pinned) {
        const style = document.createElement('style');
        style.id = '__look-hide-style';
        style.textContent = '[data-look-hide]{visibility:hidden !important}';
        document.head.append(style);
        for (const node of document.body.querySelectorAll('*')) {
          if (wrapper.contains(node) || node.contains(wrapper)) continue;
          const position = getComputedStyle(node).position;
          if (position === 'fixed' || position === 'sticky') node.setAttribute('data-look-hide', '');
        }
      }
    })(${SECTION_FINDER}, ${JSON.stringify(section)}, ${place.y}, ${place.pinned})`,
  );
  try {
    await page.waitForTimeout(SHOT_SETTLE_MS);
    const clip = { x: place.x, y: place.y, width: place.width, height: place.height };
    return await page.screenshot({ type: 'jpeg', quality, animations: 'disabled', clip, fullPage: !place.pinned });
  } finally {
    await page.evaluate(() => {
      document.getElementById('__look-hide-style')?.remove();
      for (const node of document.querySelectorAll('[data-look-hide]')) node.removeAttribute('data-look-hide');
    });
  }
}

// Вырезка места находки: страница прокручивается так, чтобы место было в середине экрана (липкая шапка его не закроет),
// элементы находки обводятся на время снимка. `clip` Playwright без `fullPage` считается от верха экрана.
async function shootClip(page: Page, viewport: Viewport, finding: LayoutFinding, quality: number): Promise<Uint8Array> {
  const { clip } = finding;
  const centered = Math.max(0, Math.round(clip.y - (viewport.height - clip.height) / 2));
  const top = finding.fixed ? 0 : centered;
  const scrolled = await page.evaluate(
    ([y, mark]) => {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      const show: unknown = Reflect.get(window, '__lookMark');
      if (typeof show === 'function') show.call(window, mark);
      return window.scrollY;
    },
    [top, finding.mark],
  );
  try {
    await page.waitForTimeout(SHOT_SETTLE_MS);
    const area = { x: clip.x, y: clip.y - scrolled, width: clip.width, height: clip.height };
    return await page.screenshot({ type: 'jpeg', quality, animations: 'disabled', clip: area });
  } finally {
    await page.evaluate(() => {
      const hide: unknown = Reflect.get(window, '__lookUnmark');
      if (typeof hide === 'function') hide.call(window);
    });
  }
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
    detect: (section) => runDetector(page, section),
    layout: (section) => runLayout(page, device, section),
    shootClip: (finding, quality) => shootClip(page, viewport, finding, quality),
    locateSection: (section) => locateSection(page, viewport, section),
    shootSection: (place, section, quality) => shootSection(page, place, section, quality),
  };
}
