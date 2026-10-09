import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import { openBroker } from '../src/broker';
import { jsonLog } from '../src/log';

// pnpm shop show|restart --site <id> — служебная команда (design.md блока 6, В6-4: «перезапуск — одна служебная
// команда»). show — строка магазина и его последние 5 сборок; restart — событие restart: остановленный магазин
// собирается заново с первого запуска. База и брокер — из DATABASE_URL и RABBITMQ_URL (значения не печатаются).
const { positionals, values } = parseArgs({ allowPositionals: true, options: { site: { type: 'string' } } });
const command = positionals[0] ?? 'show';
const siteId = values.site ?? '';
const write = (line: string): void => void process.stdout.write(line);

async function show(): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const shop = await db.query<Record<string, unknown>>('SELECT * FROM storefront_shop WHERE site_id = $1', [siteId]);
  const builds = await db.query<Record<string, unknown>>(
    `SELECT build, outcome, events, attempt, started_at, finished_at, steps, error FROM storefront_build
     WHERE site_id = $1 ORDER BY build DESC LIMIT 5`,
    [siteId],
  );
  write(`${JSON.stringify({ shop: shop.rows[0] ?? null, builds: builds.rows }, null, 2)}\n`);
  await db.end();
}

async function restart(): Promise<void> {
  const broker = openBroker(
    process.env.RABBITMQ_URL ?? '',
    jsonLog(write, () => new Date()),
  );
  await broker.publishEvent({ type: 'restart', siteId, eventAt: new Date().toISOString(), source: 'pnpm shop' });
  await broker.close();
  write(`событие restart для ${siteId} отправлено\n`);
}

const COMMANDS: Readonly<Record<string, () => Promise<void>>> = { show, restart };
const run = COMMANDS[command];
if (run === undefined || siteId === '') throw new Error('нужно: pnpm shop show|restart --site <id>');
await run();
