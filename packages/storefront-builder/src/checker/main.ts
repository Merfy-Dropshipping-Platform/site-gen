import { createServer } from 'node:http';
import { collectPassport, loadReleaseRules, openPage } from '@merfy/stand-check';
import { consumeAudits } from '../audit/run';
import { openBroker } from '../broker';
import { jsonLog } from '../log';
import { ChromiumRenderer } from '../look/look-browser';
import { startLooks } from '../look/look-job';
import { openWithCheckout, readCheckerSettings, startChecker } from './check';

// Точка входа проверяющего процесса (design.md блока 10, П10-3 В): `pnpm --filter @merfy/storefront-builder checker`;
// в образе — цель Dockerfile storefront-checker (Chromium), в Coolify — отдельное приложение с пределом памяти. Слушает
// storefront_checks по одному заданию, отвечает в storefront_check_results; с 28.10 ещё снимки черновика —
// storefront_looks, до двух разом, ответ на адрес вызывающего (README, «Снимок черновика»). На PORT — только /health.

const clock = (): Date => new Date();
const log = jsonLog((line) => process.stdout.write(line), clock);
const settings = readCheckerSettings(process.env);
const broker = openBroker(settings.rabbitmqUrl, log);
const rules = await loadReleaseRules();
// Ошибки страницы оформления — рядом с главной (openWithCheckout): на главной их не видно.
const open = (url: string) =>
  openWithCheckout((target) => openPage(target, { sabotage: [] }, (page) => collectPassport(page, 'dev')), url);
await startChecker(broker, {
  open,
  rules,
  log,
  // Ожидание новой сборки раздачи (№77): опрос ETag главной каждые 250 мс, предел — 30 с.
  fetch: (address) => fetch(address),
  homePollMs: 250,
  homeWaitMs: 30_000,
});
// Снимки — свой браузер процесса: проверки выпуска открывают свой через stand-check. Браузер и замер скорости машины
// (замедление ЦП телефона для Web Vitals, `cpuRateFor`) — прогревом при старте, а не в сроке первого снимка.
const renderer = new ChromiumRenderer({
  onCalibrated: (benchmarkIndex, cpuRate) => log('look-calibrated', { benchmarkIndex, cpuRate }),
});
if (settings.sitesUrl === null) log('look-disabled', { reason: 'SITES_SERVICE_URL не задан' });
else {
  void renderer.warm().catch((error: unknown) => log('look-warm-failed', { error: String(error) }));
  await startLooks(broker, {
    renderer,
    fetch: (address, init) => fetch(address, init),
    sitesUrl: settings.sitesUrl,
    log,
    now: () => Date.now(),
  });
}
// Аудит опубликованных страниц после публикации (место проверок `audit`): тот же браузер, Lighthouse — фоном, после
// снимков черновика; адрес sites ему не нужен. Бюджет на страницу — 2 минуты, из них на ожидание новой страницы в
// раздаче — до 30 с.
await consumeAudits(broker, {
  measure: (url, budgetMs) => renderer.audit(url, budgetMs),
  fetch: (address) => fetch(address),
  pollMs: 250,
  waitMs: 30_000,
  budgetMs: 120_000,
  now: clock,
  log,
});
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404).end();
}).listen(settings.port);
log('checker-started', { port: settings.port, rules: rules.length, looks: settings.sitesUrl !== null });

// Остановка по сигналу Coolify: недоделанное задание брокер вернёт в очередь — его возьмёт следующий запуск (снимок с
// истёкшим сроком следующий запуск отклонит сразу: вызывающий его уже не ждёт).
async function shutdown(): Promise<void> {
  server.close();
  await broker.close();
  await renderer.close().catch(() => undefined);
  log('checker-stopped');
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
