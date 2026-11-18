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

  // Прогон Lighthouse по вкладке `page`: элементы непройденных проверок с секциями (`LighthouseRaw`).
  async run(page: Page, device: LookDevice): Promise<unknown> {
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
