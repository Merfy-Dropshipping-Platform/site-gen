// Отрисовщик снимков черновика на Chromium (перенесено 28.10 из merfy-mcp `src/nova/look-browser.ts`). В проверяющем
// процессе браузер — тот, что в образе Playwright (цель `storefront-checker`), поэтому путь к нему не ищем: поиск
// системного Chromium (`look-chromium.ts` в MCP) здесь не нужен, а `executablePath` можно задать для отладки.
//
// Один браузер на процесс, запускается при первой отрисовке; на каждое задание — свои контексты (cookie и кэш не делятся
// между магазинами). Не больше двух отрисовок одновременно, остальные ждут. На задание — один общий срок 30 секунд (или
// меньше, если задание долго шло до процесса): по его концу контексты закрываются, операция над страницей отвечает
// понятным отказом.
import type { Browser, BrowserContext } from 'playwright';
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
}

export class ChromiumRenderer implements PageRenderer {
  private browser: Promise<Browser> | undefined;
  private readonly slots: Slots;
  private readonly timeoutMs: number;

  constructor(private readonly options: ChromiumRendererOptions = {}) {
    this.slots = new Slots(options.maxConcurrent ?? MAX_CONCURRENT_RENDERS);
    this.timeoutMs = options.timeoutMs ?? RENDER_TIMEOUT_MS;
  }

  private start(): Promise<Browser> {
    this.browser ??= this.launch().catch((error: unknown) => {
      this.browser = undefined;
      throw error;
    });
    return this.browser;
  }

  private async launch(): Promise<Browser> {
    const { chromium } = await import('playwright');
    const executablePath = this.options.executablePath;
    try {
      const browser = await chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
        ...(executablePath ? { executablePath } : {}),
      });
      browser.on('disconnected', () => {
        this.browser = undefined;
      });
      return browser;
    } catch (error) {
      throw new LookError('no-browser', NO_BROWSER_TEXT, { cause: error });
    }
  }

  // Закрывает браузер (при остановке процесса и в тестах); следующая отрисовка запустит новый.
  async close(): Promise<void> {
    const running = this.browser;
    this.browser = undefined;
    if (running) await (await running).close();
  }

  async open(input: RenderInput): Promise<RenderedPage> {
    await this.slots.acquire();
    const job = new RenderJob(this.slots, Math.min(this.timeoutMs, input.timeoutMs ?? this.timeoutMs));
    try {
      const browser = await job.guard(() => this.start());
      const sessions = await Promise.all(
        input.devices.map((device) => this.openDevice(browser, job, device, input.html)),
      );
      return { sessions, close: () => job.close() };
    } catch (error) {
      await job.close();
      throw error;
    }
  }

  private async openDevice(browser: Browser, job: RenderJob, device: LookDevice, html: string): Promise<PageSession> {
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
    const session = await job.guard(() => openPage(context, device, html));
    return {
      ...session,
      shoot: (index, quality) => job.guard(() => session.shoot(index, quality)),
      detect: () => job.guard(() => session.detect()),
      layout: (section) => job.guard(() => session.layout(section)),
      shootClip: (finding, quality) => job.guard(() => session.shootClip(finding, quality)),
      locateSection: (section) => job.guard(() => session.locateSection(section)),
      shootSection: (place, section, quality) => job.guard(() => session.shootSection(place, section, quality)),
    };
  }
}
