// Эталон «Шапки» и «Подвала» (блок 7, часть 7б, Р7б-13): снимки опубликованного flux-магазина
// на dev по публичному адресу, только GET (Р7б-13, RULES секций §11). Входа нет: адрес публичный.
// Перехватчик отменяет любой запрос, кроме GET; отменённые печатаются в конце.
// Запуск: FLUX_URL=<адрес> OUT=<папка эталонов> node e2e/s2-b7b/shoot-flux.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const { FLUX_URL, OUT } = process.env;
if (!FLUX_URL || !OUT) throw new Error('нужны FLUX_URL и OUT');

const SCREENS = [
  { name: 'store-header-1360', width: 1360 },
  { name: 'store-header-menu-1360', width: 1360 },
  { name: 'store-header-375', width: 375 },
  { name: 'store-header-burger-375', width: 375 },
  { name: 'store-footer-1360', width: 1360 },
  { name: 'store-footer-375', width: 375 },
];

const browser = await chromium.launch();
const cancelled = [];

for (const screen of SCREENS) {
  const context = await browser.newContext({ viewport: { width: screen.width, height: 900 } });
  await context.route('**/*', (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.continue();
    cancelled.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${FLUX_URL}/`, { waitUntil: 'networkidle', timeout: 60_000 });

  if (screen.name === 'store-header-menu-1360') {
    await page.getByRole('button', { name: 'Каталог' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Шарфы' }).click();
    await page.waitForTimeout(600);
  }
  if (screen.name === 'store-header-burger-375') {
    await page.getByRole('button', { name: 'Меню' }).click();
    await page.waitForTimeout(800);
    await page.locator('#flux-burger').getByText('Каталог', { exact: true }).click();
    await page.waitForTimeout(600);
  }

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await mkdir(path.join(OUT, screen.name), { recursive: true });
  await page.screenshot({
    path: path.join(OUT, screen.name, `ref-${screen.width}.png`),
    fullPage: true,
  });
  console.log(`снят ${screen.name}`);
  await context.close();
}

await browser.close();
console.log(cancelled.length ? `отменены не-GET запросы:\n${cancelled.join('\n')}` : 'не-GET запросов нет');
