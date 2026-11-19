// Отрисовщик снимков черновика на Chromium (перенесено 28.10 из merfy-mcp `src/nova/look-browser.ts`). В проверяющем
// процессе браузер — тот, что в образе Playwright (цель `storefront-checker`), поэтому путь к нему не ищем: поиск
// системного Chromium (`look-chromium.ts` в MCP) здесь не нужен, а `executablePath` можно задать для отладки.
//
// Один браузер на процесс, запускается при первой отрисовке; на каждое задание — свои контексты (cookie и кэш не делятся
// между магазинами). Не больше двух отрисовок одновременно, остальные ждут. На задание — один общий срок 30 секунд (или
// меньше, если задание долго шло до процесса): по его концу контексты закрываются, операция над страницей отвечает
// понятным отказом.
import type { Browser, BrowserContext, Page } from 'playwright';
import { DEFAULT_CPU_RATE, cpuRateFor } from '../checks/browser/vitals';
import { LighthouseLink, freePort } from './look-audit';
import { MOTION_EXTRA_MS } from './look-motion';
import { openPage } from './look-page';
import {
  LookError,
  VIEWPORTS,
  type LookDevice,
  type PageRenderer,
  type PageSession,
  type RenderedPage,
  type RenderInput,
} from './look-types';

export const RENDER_TIMEOUT_MS = 30_000;
export const MAX_CONCURRENT_RENDERS = 2;

const timeoutText = (ms: number): string => `Не успел отрисовать страницу за ${Math.round(ms / 1000)} с`;
const NO_BROWSER_TEXT = 'Не запустился браузер для снимков в проверяющем процессе';

// Chromium запускается без своей песочницы: в контейнере Coolify у процесса нет прав на пользовательские пространства
// имён, и с песочницей он не стартует. Защиту даёт контейнер и фильтр адресов (`look-guard.ts`). `--disable-dev-shm-usage`
// — у контейнера `/dev/shm` по умолчанию 64 МБ, на странице в 800 КБ этого не хватает.
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

// Очередь на места: `acquire` ждёт, пока не освободится одно из `size`.
export class Slots {
  private free: number;
  private readonly waiting: Array<() => void> = [];

  constructor(size: number) {
    this.free = size;
  }

  acquire(): Promise<void> {
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free += 1;
  }
}

// Одно задание: его контексты, срок и место в очереди.
class RenderJob {
  private readonly contexts: BrowserContext[] = [];
  private closed = false;
  private expired = false;
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly slots: Slots,
    private readonly timeoutMs: number,
  ) {
    this.timer = setTimeout(() => {
      this.expired = true;
      void this.close();
    }, timeoutMs);
    this.timer.unref();
  }

  async track(context: BrowserContext): Promise<void> {
    if (this.closed) {
      await context.close();
      throw new LookError('timeout', timeoutText(this.timeoutMs));
    }
    this.contexts.push(context);
  }

  // Операция над страницей, закрытой по сроку, падает как попало — отвечаем про срок, остальные ошибки отдаём как есть.
  async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw this.expired ? new LookError('timeout', timeoutText(this.timeoutMs), { cause: error }) : error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    await Promise.allSettled(this.contexts.map((context) => context.close()));
    this.slots.release();
  }
}

export interface ChromiumRendererOptions {
  executablePath?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
  // Замедление ЦП телефона на время загрузки — задать вручную (тесты); нет — по скорости машины (`cpuRateFor`).
  cpuRate?: number;
  // Скорость машины измерена: индекс Lighthouse и выбранное замедление (в журнал процесса).
  onCalibrated?: (benchmarkIndex: number, cpuRate: number) => void;
}

// Индекс скорости машины тем же тестом, что у Lighthouse (`computeBenchmarkIndex`, около 1 с), на пустой вкладке.
async function benchmarkIndex(browser: Browser): Promise<number | null> {
  const { pageFunctions } = await import('lighthouse/core/lib/page-functions.js');
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const index: unknown = await page.evaluate(`(${pageFunctions.computeBenchmarkIndex.toString()})()`);
    return typeof index === 'number' && Number.isFinite(index) ? index : null;
  } finally {
    await context.close();
  }
}

// Браузер снимков и Lighthouse к нему: связь живёт, пока жив этот браузер.
interface Running {
  browser: Browser;
  audit: LighthouseLink;
}

export class ChromiumRenderer implements PageRenderer {
  private running: Promise<Running> | undefined;
  private readonly slots: Slots;
  private readonly timeoutMs: number;
  // До замера скорости машины — замедление Lighthouse по умолчанию.
  private cpuRate: number;
  private calibrated = false;
  private calibration: Promise<void> = Promise.resolve();

  constructor(private readonly options: ChromiumRendererOptions = {}) {
    this.slots = new Slots(options.maxConcurrent ?? MAX_CONCURRENT_RENDERS);
    this.timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
    this.cpuRate = options.cpuRate ?? DEFAULT_CPU_RATE;
    this.calibrated = options.cpuRate !== undefined;
  }

  private start(): Promise<Running> {
    this.running ??= this.launch().catch((error: unknown) => {
      this.running = undefined;
      throw error;
    });
    return this.running;
  }

  private async launch(): Promise<Running> {
    const { chromium } = await import('playwright');
    const executablePath = this.options.executablePath;
    // Порт отладки — для Lighthouse (`look-audit.ts`): Playwright держит браузер по каналу, Puppeteer — по порту.
    const port = await freePort();
    try {
      const browser = await chromium.launch({
        headless: true,
        args: [...LAUNCH_ARGS, `--remote-debugging-port=${port}`],
        ...(executablePath ? { executablePath } : {}),
      });
      browser.on('disconnected', () => {
        this.running = undefined;
      });
      if (!this.calibrated) this.calibration = this.calibrate(browser);
      return { browser, audit: new LighthouseLink(port) };
    } catch (error) {
      throw new LookError('no-browser', NO_BROWSER_TEXT, { cause: error });
    }
  }

  // Скорость машины — один раз на процесс и не в сроке задания: до конца замера снимки идут с замедлением по умолчанию.
  // Не вышло — оно и остаётся.
  private async calibrate(browser: Browser): Promise<void> {
    this.calibrated = true;
    try {
      const index = await benchmarkIndex(browser);
      if (index === null) return;
      this.cpuRate = cpuRateFor(index);
      this.options.onCalibrated?.(Math.round(index), this.cpuRate);
    } catch {
      this.calibrated = false;
    }
  }

  // Прогрев при старте процесса: браузер и замер скорости машины — до первого задания, а не в его сроке.
  async warm(): Promise<void> {
    await this.start();
    await this.calibration;
  }

  // Закрывает браузер (при остановке процесса и в тестах); следующая отрисовка запустит новый.
  async close(): Promise<void> {
    const running = this.running;
    this.running = undefined;
    if (running) await (await running).browser.close();
  }

  async open(input: RenderInput): Promise<RenderedPage> {
    await this.slots.acquire();
    // Раскадровка грузит страницу второй раз и снимает до 12 кадров: сроку отрисовщика прибавляется `MOTION_EXTRA_MS`,
    // но срок задания (`input.timeoutMs`) он не превышает.
    const own = this.timeoutMs + (input.motion === true ? MOTION_EXTRA_MS : 0);
    const job = new RenderJob(this.slots, Math.min(own, input.timeoutMs ?? own));
    try {
      const running = await job.guard(() => this.start());
      const sessions = await Promise.all(
        input.devices.map((device) => this.openDevice(running, job, device, input.html)),
      );
      return { sessions, close: () => job.close() };
    } catch (error) {
      await job.close();
      throw error;
    }
  }

  private async openDevice(running: Running, job: RenderJob, device: LookDevice, html: string): Promise<PageSession> {
    const { browser, audit } = running;
    const mobile = device === 'mobile';
    const context = await browser.newContext({
      viewport: VIEWPORTS[device],
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
      locale: 'ru-RU',
      serviceWorkers: 'block',
      // Страница может нести свою политику безопасности; с ней не подключить детектор и не запустить его WASM.
      bypassCSP: true,
    });
    await job.track(context);
    // ЦП замедляется только телефону: пороги TBT у Lighthouse для компьютера — без замедления.
    const options = { cpuRate: mobile ? this.cpuRate : 1, audit: (page: Page) => audit.run(page, device) };
    const session = await job.guard(() => openPage(context, device, html, options));
    return {
      ...session,
      vitals: () => job.guard(() => session.vitals()),
      lighthouse: () => job.guard(() => session.lighthouse()),
      shoot: (index, quality) => job.guard(() => session.shoot(index, quality)),
      detect: (section) => job.guard(() => session.detect(section)),
      layout: (section) => job.guard(() => session.layout(section)),
      shootClip: (finding, quality) => job.guard(() => session.shootClip(finding, quality)),
      locateSection: (section) => job.guard(() => session.locateSection(section)),
      shootSection: (place, section, quality) => job.guard(() => session.shootSection(place, section, quality)),
      marks: (limitMs, section) => job.guard(() => session.marks(limitMs, section)),
      motion: (options) => job.guard(() => session.motion(options)),
    };
  }
}
