import { createServer } from 'node:http';
import { collectPassport, loadReleaseRules, openPage } from '@merfy/stand-check';
import { openBroker } from '../broker';
import { jsonLog } from '../log';
import { readCheckerSettings, startChecker } from './check';

// Точка входа проверяющего процесса (design.md блока 10, П10-3 В): `pnpm --filter @merfy/storefront-builder checker`;
// в образе — цель Dockerfile storefront-checker (Chromium), в Coolify — отдельное приложение с пределом памяти. Слушает
// storefront_checks по одному заданию, отвечает в storefront_check_results; на PORT — только /health для Coolify.

const clock = (): Date => new Date();
const log = jsonLog((line) => process.stdout.write(line), clock);
const settings = readCheckerSettings(process.env);
const broker = openBroker(settings.rabbitmqUrl, log);
const rules = await loadReleaseRules();
const open = (url: string) => openPage(url, { sabotage: [] }, (page) => collectPassport(page, 'dev'));
await startChecker(broker, { open, rules, log });
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404).end();
}).listen(settings.port);
log('checker-started', { port: settings.port, rules: rules.length });

// Остановка по сигналу Coolify: недоделанное задание брокер вернёт в очередь — его возьмёт следующий запуск.
async function shutdown(): Promise<void> {
  server.close();
  await broker.close();
  log('checker-stopped');
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
