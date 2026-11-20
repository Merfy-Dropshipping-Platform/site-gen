// Lighthouse к вкладке снимка (18.11). Lighthouse работает только через страницу Puppeteer, а снимок держит Playwright,
// поэтому браузер снимков запускается с портом отладки (`look-browser.ts`), и на каждый прогон Puppeteer подключается к
// нему, берёт ту же вкладку и отдаёт её Lighthouse в режиме snapshot. Вкладку он не закрывает и не перезагружает:
// после прогона Playwright снимает её дальше (проверено 18.11).
//
// Порт слушает только 127.0.0.1 внутри контейнера. Код страницы до него не дотянется: http-запросы к внутренним адресам
// режет фильтр снимка (`look-guard.ts`), а WebSocket к отладке Chromium без точного адреса (его отдаёт только http) и с
// заголовком Origin веб-страницы не примет; запрос через имя, которое указывает на 127.0.0.1, отладка отвергает по
// заголовку Host.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { Page } from 'playwright';
import type { Page as PuppeteerPage, Target, TargetType } from 'puppeteer-core';
import {
  AuditLcp,
  lcpNodeOf,
  metricsOf,
  opportunitiesOf,
  type AuditReport,
  type LcpNodeRaw,
} from '../checks/audit/report';
import {
  PLACES_BY_PATH,
  failedNodes,
  lighthouseConfig,
  tagOfSnippet,
  type FailedNode,
} from '../checks/browser/lighthouse';
import type { LookDevice } from './look-types';

// Свободный порт для отладки Chromium: занимаем и сразу отпускаем — до запуска браузера его никто не возьмёт.
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') resolve(address.port);
        else reject(new Error('порт отладки не выдался'));
      });
    });
  });
}

// Очередь прогонов Lighthouse (19.11). Lighthouse ведёт замеры через глобальный `performance` процесса: два прогона разом
// затирают метки друг друга и падают с `lh:runner:gather` («The start lh:gather:getBenchmarkIndex performance mark has
// not been set»). А снимки идут по два сразу (`MAX_CONCURRENT_RENDERS`), поэтому прогоны встают в очередь: по одному на
// процесс, а значит и на его браузер.
export class LighthouseBusy extends Error {
  constructor(waitMs: number) {
    super(`очередь Lighthouse занята другим снимком: не дождался за ${Math.round(waitMs / 100) / 10} с`);
  }
}

// Фоновый прогон — аудит опубликованной страницы (`navigate`, место проверок `audit`): он ниже снимков черновика. Снимки
// в очереди идут раньше него, а идущий фоновый прогон по просьбе снимка отдаёт место (`yield`) — снимки он не задерживает.
export interface TurnOptions {
  background?: boolean;
  // Освободить место как можно скорее: вызывается, когда в очередь встал снимок.
  yield?: () => void;
}

export class LighthouseTurns {
  private busy = false;
  private holder: TurnOptions = {};
  private readonly waiting: Array<() => void> = [];
  private readonly background: Array<() => void> = [];

  // Место в очереди: ждёт не дольше `waitMs`; не дождался — `LighthouseBusy`, и очередь он не занимает. Отдаёт, чем
  // место освободить.
  take(waitMs: number, options: TurnOptions = {}): Promise<() => void> {
    if (!this.busy) return Promise.resolve(this.grant(options));
    if (options.background !== true) this.holder.yield?.();
    const queue = options.background === true ? this.background : this.waiting;
    return new Promise((resolve, reject) => {
      const turn = (): void => {
        clearTimeout(timer);
        resolve(this.grant(options));
      };
      const giveUp = (): void => {
        queue.splice(queue.indexOf(turn), 1);
        reject(new LighthouseBusy(waitMs));
      };
      const timer = setTimeout(giveUp, waitMs);
      queue.push(turn);
    });
  }

  // Начался снимок черновика: идущий фоновый прогон просят уступить место заранее, пока снимок готовит страницу, а не
  // когда он дойдёт до своего Lighthouse и станет ждать.
  preempt(): void {
    if (this.busy) this.holder.yield?.();
  }

  private grant(options: TurnOptions): () => void {
    this.busy = true;
    this.holder = options;
    return this.release;
  }

  // Место отдаётся следующему в очереди, не освобождаясь между ними: сначала снимкам, потом фоновым.
  private readonly release = (): void => {
    const next = this.waiting.shift() ?? this.background.shift();
    if (next !== undefined) return next();
    this.busy = false;
    this.holder = {};
  };
}

const turns = new LighthouseTurns();

// Снимок черновика начался: аудит опубликованной страницы, если идёт, уступает место (`LighthouseTurns.preempt`).
export const yieldToSnapshots = (): void => turns.preempt();

// Аудит не уложился в бюджет страницы; аудит уступил место снимку черновика.
export class AuditTimeout extends Error {
  constructor(budgetMs: number) {
    super(`Lighthouse не уложился в ${Math.round(budgetMs / 1000)} с`);
  }
}

export class LighthouseYielded extends Error {
  constructor() {
    super('Lighthouse уступил место снимку черновика');
  }
}

// Не дольше этого после закрытия вкладки ждём, пока Lighthouse остановится: место в очереди отдаётся только после него.
const STOP_WAIT_MS = 5_000;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Работа Lighthouse не дольше `ms` и пока снимок не попросил место. Остановка — закрытие вкладки: Lighthouse падает сам.
async function stopWhen<T>(work: Promise<T>, ms: number, signal: AbortSignal, close: () => Promise<void>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const stop = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuditTimeout(ms)), ms);
    signal.addEventListener('abort', () => reject(new LighthouseYielded()), { once: true });
  });
  try {
    return await Promise.race([work, stop]);
  } catch (error) {
    await close().catch(() => undefined);
    await Promise.race([work.catch(() => undefined), pause(STOP_WAIT_MS)]);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Настройки аудита: только скорость; телефон и замедление — по умолчанию Lighthouse (симуляция: ЦП ×4, 1,6 Мбит/с).
const AUDIT_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: { onlyCategories: ['performance'], disableFullPageScreenshot: true, locale: 'ru' as const },
};

// Секция главного элемента первого экрана: страница находит его по пути Lighthouse; нет — описание по началу разметки.
async function lcpPlace(page: PuppeteerPage, node: LcpNodeRaw | null): Promise<AuditLcp | null> {
  if (node === null) return null;
  const fallback = { where: tagOfSnippet(node.snippet), section: null, name: null };
  if (node.path === null) return fallback;
  const script = `(${PLACES_BY_PATH})(${JSON.stringify([node.path])})`;
  const places: unknown = await page.evaluate(script).catch(() => null);
  const place = AuditLcp.safeParse(Array.isArray(places) ? places[0] : null);
  return place.success ? place.data : fallback;
}

const TOKEN_KEY = '__lookAuditToken';

// Секции элементов непройденных проверок: страница находит их по путям Lighthouse; элемента уже нет — описание по
// началу разметки.
async function placesOf(page: Page, nodes: FailedNode[]): Promise<unknown[]> {
  if (nodes.length === 0) return [];
  // Строку Playwright только вычисляет, функцию из неё с аргументом не зовёт — вызов пишем сами.
  const places: unknown = await page.evaluate(`(${PLACES_BY_PATH})(${JSON.stringify(nodes.map((node) => node.path))})`);
  const list = Array.isArray(places) ? places : [];
  return nodes.map((node, index) => {
    const place: unknown = list[index];
    return place !== null && typeof place === 'object'
      ? { audit: node.audit, ...place }
      : { audit: node.audit, section: null, where: tagOfSnippet(node.snippet) };
  });
}

export class LighthouseLink {
  constructor(private readonly port: number) {}

  // Прогон Lighthouse по вкладке `page`: элементы непройденных проверок с секциями (`LighthouseRaw`). Идёт в очереди
  // процесса, ждать её — не дольше `waitMs`.
  async run(page: Page, device: LookDevice, waitMs: number): Promise<unknown> {
    const release = await turns.take(waitMs);
    try {
      return await this.measure(page, device);
    } finally {
      release();
    }
  }

  private async measure(page: Page, device: LookDevice): Promise<unknown> {
    // Метка вкладки: на тот же адрес может быть открыто несколько вкладок (телефон, компьютер, соседнее задание).
    const token = randomUUID();
    await page.evaluate(([key, value]) => Reflect.set(window, key, value), [TOKEN_KEY, token] as const);
    const url = page.url();
    const { default: puppeteer, TargetType: types } = await import('puppeteer-core');
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${this.port}`,
      defaultViewport: null,
      // Чужие вкладки не трогаем: Puppeteer подключается только к вкладкам с тем же адресом.
      targetFilter: (target) => target.type() !== types.PAGE || target.url() === url,
    });
    try {
      const own = await this.find(browser.targets(), token, types.PAGE);
      const { snapshot } = await import('lighthouse');
      const result = await snapshot(own, { config: lighthouseConfig(device), flags: { logLevel: 'error' } });
      if (result === undefined) throw new Error('Lighthouse не вернул отчёт');
      return await placesOf(page, failedNodes(result.lhr));
    } finally {
      await browser.disconnect();
    }
  }

  // Аудит опубликованной страницы (место проверок `audit`): Lighthouse navigation в новой вкладке, телефон, стандартное
  // замедление. Идёт в той же очереди процесса, но фоном: снимки черновика идут раньше и, если в очередь встал снимок,
  // аудит отдаёт место (`LighthouseYielded`). Бюджет `budgetMs` — вместе с ожиданием очереди; не уложился —
  // `AuditTimeout`, вкладка закрыта.
  async navigate(url: string, budgetMs: number): Promise<AuditReport> {
    const startedAt = Date.now();
    const stop = new AbortController();
    const release = await turns.take(budgetMs, { background: true, yield: () => stop.abort() });
    try {
      return await this.audit(url, budgetMs - (Date.now() - startedAt), stop.signal);
    } finally {
      release();
    }
  }

  private async audit(url: string, budgetMs: number, signal: AbortSignal): Promise<AuditReport> {
    const { default: puppeteer, TargetType: types } = await import('puppeteer-core');
    // Чужие вкладки не трогаем: подключаемся только к пустым (новая вкладка аудита начинается с about:blank).
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${this.port}`,
      defaultViewport: null,
      targetFilter: (target) => target.type() !== types.PAGE || target.url() === 'about:blank',
    });
    const page = await browser.newPage();
    try {
      const { default: lighthouse } = await import('lighthouse');
      const run = lighthouse(url, { logLevel: 'error' }, AUDIT_CONFIG, page);
      const result = await stopWhen(run, budgetMs, signal, () => page.close());
      if (result === undefined) throw new Error('Lighthouse не вернул отчёт');
      const lcp = await lcpPlace(page, lcpNodeOf(result.lhr));
      return { metrics: metricsOf(result.lhr), lcp, opportunities: opportunitiesOf(result.lhr) };
    } finally {
      await page.close().catch(() => undefined);
      await browser.disconnect();
    }
  }

  private async find(targets: Target[], token: string, pageType: TargetType): Promise<PuppeteerPage> {
    for (const target of targets) {
      if (target.type() !== pageType) continue;
      const candidate = await target.page();
      if (candidate === null) continue;
      const mark: unknown = await candidate.evaluate((key: string): unknown => Reflect.get(window, key), TOKEN_KEY);
      if (mark === token) return candidate;
    }
    throw new Error('Lighthouse не нашёл вкладку снимка');
  }
}
