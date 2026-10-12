import { chromium, type Browser } from 'playwright';
import { installMocks } from '../browser/mocks';
import type { ShotEntry } from '../report/report';
import { STAND_PATH } from '../stand-path.mjs';
import { diffPng } from './diff';
import { shotKey, thresholdOf, type Thresholds } from './thresholds';

// Снимки страниц (design.md блока 10, Э3; Э10-1 А): главная и страница стенда; ширины 390 и 1240; снимок — во всю
// высоту, анимации выключены. Страница ответила не 200 — её снимков нет (стенд есть не у каждой сборки). Отличие выше
// порога — жёлтое: вид решает человек.
export const SHOT_WIDTHS = [390, 1240] as const;
const SHOT_HEIGHT = 900;

export interface ShotPage {
  name: string;
  path: string;
}

const PAGES: readonly ShotPage[] = [
  { name: 'home', path: '/' },
  { name: 'stand', path: STAND_PATH },
];

export interface Shot {
  page: string;
  width: number;
  png: Buffer;
}

export interface ShotDifference {
  key: string;
  page: string;
  width: number;
  ratio: number;
  threshold: number;
  over: boolean;
  diff: Buffer | null;
}

export interface ShotOptions {
  routes?: unknown;
  pages?: readonly ShotPage[];
}

export const shotFileName = (shot: Pick<Shot, 'page' | 'width'>): string => `${shot.page}-${shot.width}.png`;

async function shotOf(browser: Browser, url: string, width: number, routes: unknown): Promise<Buffer | null> {
  const page = await browser.newPage({ locale: 'ru-RU', viewport: { width, height: SHOT_HEIGHT } });
  try {
    if (routes !== undefined) await installMocks(page, routes);
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (response?.status() !== 200) return null;
    return await page.screenshot({ fullPage: true, animations: 'disabled' });
  } finally {
    await page.close();
  }
}

async function shotsWith(browser: Browser, baseUrl: string, options: ShotOptions): Promise<Shot[]> {
  const targets = (options.pages ?? PAGES).flatMap((page) => SHOT_WIDTHS.map((width) => ({ ...page, width })));
  const shots: Shot[] = [];
  for (const target of targets) {
    const png = await shotOf(browser, new URL(target.path, baseUrl).href, target.width, options.routes);
    if (png !== null) shots.push({ page: target.name, width: target.width, png });
  }
  return shots;
}

// Один браузер на все снимки прогона; страницы — по одной.
export async function takeShots(baseUrl: string, options: ShotOptions = {}): Promise<Shot[]> {
  const browser = await chromium.launch();
  try {
    return await shotsWith(browser, baseUrl, options);
  } finally {
    await browser.close();
  }
}

// Пары «до» и «после» по странице и ширине. Снимка с одной стороны нет или ключ в skip — пары нет.
export function compareShots(theme: string, before: readonly Shot[], after: readonly Shot[], thresholds: Thresholds) {
  return after.flatMap((shot): ShotDifference[] => {
    const pair = before.find((candidate) => candidate.page === shot.page && candidate.width === shot.width);
    const key = shotKey(theme, shot.page, shot.width);
    const threshold = thresholdOf(thresholds, key);
    if (pair === undefined || threshold === null) return [];
    const { ratio, diff } = diffPng(pair.png, shot.png);
    return [{ key, page: shot.page, width: shot.width, ratio, threshold, over: ratio > threshold, diff }];
  });
}

// Снимок прогона стенда в отчёте: без пары — пару «до» и «после» сравнивает команда выпуска (блок 10).
export const standShotEntry = (shot: Shot): ShotEntry => ({
  title: `${shot.page}, ${shot.width} px`,
  images: [{ label: 'снимок', src: `shots/${shotFileName(shot)}` }],
  note: 'без пары: «до» и «после» сравнивает команда выпуска',
  over: false,
});
