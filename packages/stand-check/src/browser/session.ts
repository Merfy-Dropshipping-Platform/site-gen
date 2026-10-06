import { chromium, type Page } from 'playwright';
import { StandError } from '../errors';
import { SABOTAGE, type SabotageName } from '../run/sabotage';
import { installMocks } from './mocks';

export type PageOptions = { routes?: unknown; sabotage: readonly SabotageName[] };

const VIEWPORT = { width: 1280, height: 800 };
const OK_STATUS = 200;

async function prepare(page: Page, options: PageOptions): Promise<void> {
  if (options.routes !== undefined) await installMocks(page, options.routes);
  await Promise.all(options.sabotage.map((name) => page.addInitScript(SABOTAGE[name])));
}

// Браузер на один прогон: подмены и поломки ставятся до загрузки, страница должна ответить 200.
export async function openPage<T>(url: string, options: PageOptions, use: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ locale: 'ru-RU', viewport: VIEWPORT });
    await prepare(page, options);
    const response = await page.goto(url, { waitUntil: 'load' });
    const status = response?.status() ?? 0;
    if (status !== OK_STATUS) throw new StandError('page-unavailable', `${url} ответил ${status}`);
    return await use(page);
  } finally {
    await browser.close();
  }
}
