// Аудит опубликованной страницы (Lighthouse navigation) в настоящем Chromium (20.11): метрики, главный элемент LCP и его
// секция, фоновое место в очереди. Пропускается, если браузера Playwright нет; сеть не нужна — страница на локальном
// сервере. Прогон идёт десятки секунд, поэтому срок теста длиннее обычного.
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditReport } from '../src/checks/audit/report';
import { ChromiumRenderer } from '../src/look/look-browser';

const hasChromium = existsSync(chromium.executablePath());

// Крупная картинка первого экрана в секции с обёрткой, как у витрины: id экземпляра и полное имя секции.
const BIG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><!-- ${'0123456789abcdef'.repeat(2_048)} -->` +
    '<rect width="800" height="600" fill="#7c3aed"/></svg>',
)}`;
const PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Шарфы</title></head><body>
<merfy-section data-section="shop:hero" data-section-id="hero-1" style="display:block">
<img src="${BIG}" width="800" height="600" alt="Шарфы" style="width:100%;height:auto"></merfy-section>
<merfy-section data-section="shop:text" data-section-id="text-1" style="display:block"><p>Тёплые шарфы</p></merfy-section>
</body></html>`;

let server: Server;
let url = '';

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}/`;
});
afterAll(() => {
  server.close();
});

describe.skipIf(!hasChromium)('аудит опубликованной страницы · настоящий Chromium', () => {
  it('метрики Web Vitals, главный элемент первого экрана и его секция', async () => {
    const renderer = new ChromiumRenderer();
    try {
      const report = AuditReport.parse(await renderer.audit(url, 90_000));
      expect(report.metrics.perf).toBeGreaterThan(0);
      expect(report.metrics.lcpMs).toBeGreaterThan(0);
      expect(report.metrics.cls).toBeGreaterThanOrEqual(0);
      expect(report.lcp).toEqual({ where: 'img', section: 'hero-1', name: 'shop:hero' });
    } finally {
      await renderer.close();
    }
  }, 120_000);

  it('не уложился в бюджет — отказ с причиной, вкладка закрыта', async () => {
    const renderer = new ChromiumRenderer();
    try {
      await expect(renderer.audit(url, 1_500)).rejects.toThrow(/Lighthouse не уложился в \d+ с/);
    } finally {
      await renderer.close();
    }
  }, 120_000);
});
