import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { platformRenderHash, readThemeState } from '@merfy/storefront-build';
import { createS3Store, readPointer } from '@merfy/storefront-storage';
import { z } from 'zod';
import { liveHome } from '../__tests__/stack/builder';
import { startFakeProducts } from '../__tests__/stack/fake-product';
import { STACK, insertSite, openPool, resetBuilder, shopRow, until } from '../__tests__/stack/stack';
import { openBroker } from '../src/broker';
import { jsonLog } from '../src/log';

// pnpm probe — сборщик целиком, как в образе: настоящая точка входа (src/main.ts) отдельным процессом, настоящий
// рисовальщик темы nova (`pnpm renderer`), стенд compose.stack.yml (`pnpm stack:up`), подставной сервис товаров.
// Публикация → витрина, правка имени, магазин без SEO-описания, сто правок подряд, дорисовка, p95 по таблице сборок,
// остановка по SIGTERM.
// PROBE_BUILDER_URL — проба уже запущенного сборщика (образ Docker, «Проверка блока»): свой процесс не запускается,
// остановку проверяет `docker stop`.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PORT = 18_090;
const EXTERNAL = process.env.PROBE_BUILDER_URL;
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`;
const EDITS = 100;
const P95_LIMIT_MS = 5_000;
const NOT_STOPPED = 'без строки builder-stopped';
const write = (line: string): void => void process.stdout.write(`${line}\n`);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PACKAGE_DIR, encoding: 'utf8' }).trim();
const env = {
  ...process.env,
  DATABASE_URL: STACK.databaseUrl,
  RABBITMQ_URL: STACK.rabbitmqUrl,
  S3_ENDPOINT: STACK.s3.endpoint,
  S3_BUCKET: STACK.s3.bucket,
  S3_ACCESS_KEY: STACK.s3.accessKeyId,
  S3_SECRET_KEY: STACK.s3.secretAccessKey,
  STOREFRONT_API_URL: 'https://gateway.dev.merfy.ru/api',
  SOURCE_COMMIT: commit,
  PORT: String(PORT),
  BUILD_LEASE_MS: '5000',
};

const logs: string[] = [];

function startBuilder(): ChildProcess {
  const child = spawn('node_modules/.bin/tsx', ['src/main.ts'], {
    cwd: PACKAGE_DIR,
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout.on('data', (chunk: Buffer) => logs.push(...chunk.toString('utf8').split('\n')));
  return child;
}

// Остановка по SIGTERM: сборщик дописывает строку builder-stopped и выходит сам.
async function stopBuilder(running: ChildProcess | null): Promise<string> {
  if (running === null) return 'внешний сборщик — проверяет docker stop';
  running.kill('SIGTERM');
  await new Promise((resolve) => running.once('exit', resolve));
  return logs.some((line) => line.includes('"msg":"builder-stopped"')) ? 'чисто' : NOT_STOPPED;
}

const healthy = async (): Promise<boolean> => (await fetch(`${BASE}/health`).catch(() => null))?.ok === true;

const products = await startFakeProducts();
const db = openPool();
await resetBuilder(db);
const store = createS3Store(STACK.s3);
const site = await insertSite(db, { name: 'Проба 0' });
// У магазина пробы SEO-описание есть, у второго — нет: мерчант может его не заполнить, а магазин должен собираться
// (владелец 08.10).
const branding = { seo: { description: 'Магазин пробы сборщика' } };
await db.query('UPDATE site SET branding = $2 WHERE id = $1', [site.id, JSON.stringify(branding)]);
const label = (site.publicUrl ?? '').split('.')[0];
const plain = await insertSite(db, { name: 'Проба без описания' });
const broker = openBroker(
  STACK.rabbitmqUrl,
  jsonLog(
    () => undefined,
    () => new Date(),
  ),
);
const child = EXTERNAL === undefined ? startBuilder() : null;
// Проба упала — последние 30 строк журнала сборщика, и сборщик не остаётся висеть.
process.once('exit', (code) => {
  if (code !== 0) write(logs.slice(-30).join('\n'));
  child?.kill('SIGKILL');
});
await until(healthy, 60_000);
write('сборщик запущен: /health 200');

async function rename(name: string, type: string): Promise<void> {
  await db.query('UPDATE site SET name = $2, updated_at = now() WHERE id = $1', [site.id, name]);
  await broker.publishEvent({ type, siteId: site.id, eventAt: new Date().toISOString(), source: 'probe' });
}

// Правка → покупатель видит новое имя на главной живой сборки. Возвращает, за сколько мс.
async function edit(name: string, type: string): Promise<number> {
  const started = Date.now();
  await rename(name, type);
  await until(async () => (await liveHome(store, label)).includes(`<h1>${name}</h1>`), 30_000);
  return Date.now() - started;
}

write(`публикация → витрина: ${await edit('Проба 1', 'merchant-publish')} мс`);
write(`правка имени → витрина: ${await edit('Проба 2', 'shop-name-change')} мс`);

// Магазин без SEO-описания: публикация → главная у покупателя, тега description на ней нет.
async function publishPlain(): Promise<{ ms: number; tag: boolean }> {
  const started = Date.now();
  await broker.publishEvent({
    type: 'merchant-publish',
    siteId: plain.id,
    eventAt: new Date().toISOString(),
    source: 'probe',
  });
  const plainLabel = (plain.publicUrl ?? '').split('.')[0];
  await until(async () => (await liveHome(store, plainLabel)).includes('<h1>Проба без описания</h1>'), 30_000);
  const tag = (await liveHome(store, plainLabel)).includes('name="description"');
  return { ms: Date.now() - started, tag };
}
const plainHome = await publishPlain();
write(`без SEO-описания → витрина: ${plainHome.ms} мс, тег description: ${plainHome.tag ? 'есть' : 'нет'}`);

const before = Number((await shopRow(db, site.id)).build);
for (let index = 1; index <= EDITS; index += 1) await rename(`Подряд ${index}`, 'shop-name-change');
await until(async () => (await liveHome(store, label)).includes(`<h1>Подряд ${EDITS}</h1>`), 60_000);
await until(async () => (await shopRow(db, site.id)).state === 'idle', 60_000);
const countSql = `SELECT count(*)::int AS builds, sum(events)::int AS events FROM storefront_build
  WHERE site_id = $1 AND build > $2`;
const counted = z
  .object({ builds: z.int(), events: z.int() })
  .parse((await db.query(countSql, [site.id, before])).rows[0]);
write(`${EDITS} правок подряд: сборок ${counted.builds}, событий в них ${counted.events}`);

const pointer = await readPointer(store, label);
const theme = `nova@${(await readThemeState(ROOT, 'nova')).version}`;
const render = await platformRenderHash(ROOT);
const query = new URLSearchParams({ shop: site.id, build: String(pointer?.build), path: '/', render, theme });
const drawn = await fetch(`${BASE}/draw?${query.toString()}`);
write(`дорисовка главной: ${drawn.status}, X-Merfy-Hash ${drawn.headers.get('x-merfy-hash')?.slice(0, 12)}…`);

const p95Sql = `SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - event_at) * 1000))::int
  AS p95 FROM storefront_build WHERE site_id = $1 AND outcome = 'live'`;
const p95 = z.object({ p95: z.int() }).parse((await db.query(p95Sql, [site.id])).rows[0]).p95;
write(`p95 «правка → витрина» по таблице сборок: ${p95} мс`);

const stopped = await stopBuilder(child);
write(`остановка по SIGTERM: ${stopped}`);
await broker.close();
await products.close();
await db.end();
const checks = [
  stopped !== NOT_STOPPED,
  !plainHome.tag,
  drawn.status === 200,
  counted.events === EDITS,
  counted.builds < EDITS,
  p95 <= P95_LIMIT_MS,
];
write(checks.every(Boolean) ? 'проба прошла' : 'проба НЕ прошла');
