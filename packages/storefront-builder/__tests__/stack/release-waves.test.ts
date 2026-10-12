import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import amqplib from 'amqplib';
import { changePointer, readPointer } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACTIVITY_EXCHANGE, EVENTS_QUEUE, JOBS_QUEUE } from '../../src/broker';
import { liveManifest } from '../../src/live';
import {
  CHECKS_QUEUE,
  CHECK_RESULTS_QUEUE,
  parseCheckJob,
  type CheckJob,
  type CheckResult,
} from '../../src/release/checks';
import { createConductor, type Conductor, type ConductorDeps } from '../../src/release/conductor';
import { listenReleases } from '../../src/release/listen';
import type { PageCheck } from '../../src/release/page-check';
import {
  createRelease,
  notifyRelease,
  readRelease,
  releaseShops,
  setRelease,
  type NewRelease,
  type ReleaseRow,
  type ReleaseShopRow,
} from '../../src/release/store';
import { planWaves } from '../../src/release/waves';
import { ensureRendererArchive } from '../../src/renderer-archive';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import { archiveLoader, createThemeCatalog, recordedVersions } from '../../src/theme-catalog';
import { FAKE_THEME, logged, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, openPool, resetBuilder, until, type SiteFields } from './stack';

// Выпуск волнами на стенде (design.md блока 10, раздел 4): настоящие база, брокер и MinIO, сборщик целиком (события и
// задания через RabbitMQ). Выпуск 0.0.1 → 0.0.9; 0.0.9 — настоящая серверная сборка nova из архива. Проверяющий процесс
// — подписчик теста на storefront_checks, проверка страниц — подставная функция.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OLD = { version: '0.0.9', contentHash: `sha256:${'9'.repeat(64)}` };
const RELEASE: NewRelease = {
  kind: 'theme',
  subject: 'nova',
  fromVersion: FAKE_THEME.version,
  toVersion: OLD.version,
  toHash: OLD.contentHash,
  contour: 'dev',
  startedBy: 'тест',
  status: 'testing',
};
const LONG = 120_000;
const IN_FLIGHT_SQL = `SELECT count(*)::int AS n FROM storefront_release_shop
  WHERE status IN ('before', 'building', 'checking')`;

// Ответы подставных частей: red — магазины с красным паспортом «после», brokenPages — метки адресов со сломанными
// страницами; maxInFlight — больше скольких магазинов выпуска в работе проверяющий процесс не видел.
const fake = { red: new Set<string>(), brokenPages: new Set<string>(), maxInFlight: 0 };

interface Stack {
  harness: Harness;
  runtime: Runtime;
  conductor: Conductor;
  stopListening: () => Promise<void>;
}

let raw: amqplib.ChannelModel;
let channel: amqplib.Channel;
let products: FakeProducts;
let checkerDb: Pool;
let activityQueue = '';
const open: Stack[] = [];

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];
const labelOfUrl = (url: string): string => new URL(url).hostname.split('.')[0];

function pageOf(url: string): PageCheck {
  if (fake.brokenPages.has(labelOfUrl(url))) return { ok: false, problems: ['/_astro/shop.css ответил 404'], files: 1 };
  return { ok: true, problems: [], files: 3 };
}

function verdictOf(job: CheckJob): CheckResult['verdict'] {
  if (job.phase === 'before') return null;
  return fake.red.has(job.siteId) ? 'red' : 'clean';
}

async function answer(job: CheckJob): Promise<CheckResult> {
  const { rows } = await checkerDb.query<{ n: number }>(IN_FLIGHT_SQL);
  fake.maxInFlight = Math.max(fake.maxInFlight, rows[0]?.n ?? 0);
  const result = { passport: { errors: [] }, verdict: verdictOf(job), differences: [], error: null };
  return { v: 1, release: job.release, siteId: job.siteId, phase: job.phase, ...result };
}

// Подставной проверяющий процесс: задание из storefront_checks → ответ в storefront_check_results.
async function startChecker(): Promise<void> {
  await channel.assertQueue(CHECKS_QUEUE, { durable: true });
  await channel.assertQueue(CHECK_RESULTS_QUEUE, { durable: true });
  await channel.consume(CHECKS_QUEUE, (message) => {
    if (message === null) return;
    const job = parseCheckJob(JSON.parse(message.content.toString('utf8')));
    void answer(job).then((result) => {
      channel.sendToQueue(CHECK_RESULTS_QUEUE, Buffer.from(JSON.stringify(result)), { persistent: true });
      channel.ack(message);
    });
  });
}

const conductorDeps = (harness: Harness, pauseMs: number): ConductorDeps => ({
  db: harness.db,
  store: harness.store,
  contour: 'dev',
  window: 1,
  pauseMs,
  clock: harness.deps.clock,
  log: harness.deps.log,
  publishEvent: harness.broker.publishEvent,
  publishCheck: harness.broker.publishCheck,
  publishActivity: harness.broker.publishActivity,
  pageCheck: (url) => Promise.resolve(pageOf(url)),
});

// Сборщик целиком: каталог с архивом 0.0.9, очередь заданий через брокер, ведущий и подписка на NOTIFY.
async function startStack(options: { pauseMs?: number; retryDelaysMs?: number[] } = {}): Promise<Stack> {
  const harness = openHarness();
  const catalog = createThemeCatalog({
    current: harness.deps.themes,
    previews: new Map(),
    index: (themeId) => recordedVersions(harness.store, themeId),
    load: archiveLoader(ROOT, harness.store, tmpdir(), harness.deps.log),
    released: () => Promise.resolve(FAKE_THEME.version),
    log: harness.deps.log,
  });
  harness.deps.catalog = catalog;
  harness.deps.snapshot = { ...harness.deps.snapshot, pins: catalog };
  harness.deps.shopState = { leaseMs: 60_000, retryDelaysMs: options.retryDelaysMs ?? [100, 200] };
  harness.deps.enqueue = enqueueVia(harness.broker, harness.deps.log);
  const conductor = createConductor(conductorDeps(harness, options.pauseMs ?? 0));
  harness.deps.conductor = conductor;
  harness.deps.afterBuild = (build) => conductor.afterBuild(build);
  const runtime = await startRuntime(harness.deps);
  const stopListening = await listenReleases(harness.db, () => void conductor.advance(), harness.deps.log);
  const stack = { harness, runtime, conductor, stopListening };
  open.push(stack);
  return stack;
}

async function stopStack(stack: Stack): Promise<void> {
  stack.conductor.stop();
  await stack.stopListening();
  stack.runtime.stop();
  await stack.harness.close();
}

const editEvent = (siteId: string) => ({
  type: 'shop-name-change',
  siteId,
  eventAt: new Date().toISOString(),
  source: 'test',
});

async function liveBuild(harness: Harness, site: SiteFields): Promise<number> {
  return (await readPointer(harness.store, labelOf(site)))?.build ?? 0;
}

// Опубликованные магазины с живой сборкой на 0.0.1: первое событие — первая сборка.
async function publishedShops(harness: Harness, count: number): Promise<SiteFields[]> {
  const sites: SiteFields[] = [];
  for (let index = 0; index < count; index += 1) sites.push(await insertSite(harness.db, { name: `Магазин ${index}` }));
  for (const site of sites) await harness.broker.publishEvent(editEvent(site.id));
  for (const site of sites) await until(async () => (await liveBuild(harness, site)) > 0, LONG);
  return sites;
}

// Выпуск: первый магазин — тестовый (волна 0), остальные — волны 1–3 по номеру выпуска.
function startRelease(harness: Harness, sites: readonly SiteFields[]): Promise<ReleaseRow> {
  const ids = sites.map((site) => site.id);
  return createRelease(harness.db, RELEASE, (id) => planWaves(ids, ids[0], id));
}

async function statusIs(harness: Harness, id: number, status: string): Promise<void> {
  await until(async () => (await readRelease(harness.db, id))?.status === status, LONG);
}

// «Да» человека — как команда approve задачи 10: волны без выдержки после тестового магазина и NOTIFY.
async function approve(harness: Harness, id: number): Promise<void> {
  await setRelease(harness.db, id, ['awaiting'], { status: 'waves', nextWaveAt: new Date() });
  await notifyRelease(harness.db, id);
}

const inWave = (shops: readonly ReleaseShopRow[], wave: number): ReleaseShopRow[] =>
  shops.filter((shop) => shop.wave === wave);

function siteOf(sites: readonly SiteFields[], siteId: string): SiteFields {
  const site = sites.find((candidate) => candidate.id === siteId);
  if (site === undefined) throw new Error(`магазина ${siteId} нет среди магазинов теста`);
  return site;
}

async function pinnedVersions(harness: Harness, ids: readonly string[]): Promise<(string | null)[]> {
  const sql = 'SELECT theme_version FROM site WHERE id::text = ANY($1) ORDER BY id';
  const { rows } = await harness.db.query<{ theme_version: string | null }>(sql, [ids]);
  return rows.map((row) => row.theme_version);
}

// Пять магазинов с живыми сборками, выпуск дошёл до «да»: тестовый магазин обновлён.
async function awaitingRelease(harness: Harness): Promise<{ sites: SiteFields[]; release: ReleaseRow }> {
  const sites = await publishedShops(harness, 5);
  const release = await startRelease(harness, sites);
  await statusIs(harness, release.id, 'awaiting');
  return { sites, release };
}

beforeAll(async () => {
  raw = await amqplib.connect(STACK.rabbitmqUrl);
  channel = await raw.createChannel();
  products = await startFakeProducts();
  checkerDb = openPool();
  const archive = openHarness();
  const archiveDeps = { store: archive.store, log: archive.deps.log, clock: archive.deps.clock };
  await ensureRendererArchive(archiveDeps, ROOT, 'nova', OLD);
  await archive.close();
  await startChecker();
  await channel.assertExchange(ACTIVITY_EXCHANGE, 'topic', { durable: true });
  activityQueue = (await channel.assertQueue('', { exclusive: true })).queue;
  await channel.bindQueue(activityQueue, ACTIVITY_EXCHANGE, 'site.release_stopped');
}, LONG);

beforeEach(async () => {
  await resetBuilder(checkerDb);
  for (const queue of [EVENTS_QUEUE, JOBS_QUEUE, CHECK_RESULTS_QUEUE, activityQueue]) await channel.purgeQueue(queue);
  fake.red.clear();
  fake.brokenPages.clear();
  fake.maxInFlight = 0;
});

afterEach(async () => {
  for (const stack of open.splice(0)) await stopStack(stack);
});

afterAll(async () => {
  await products.close();
  await checkerDb.end();
  await raw.close();
});

describe('выпуск волнами на стенде (design.md блока 10)', () => {
  it(
    'тема: тестовый и четыре магазина, всё чисто — awaiting, «да», finished',
    async () => {
      const { harness } = await startStack();
      const { sites, release } = await awaitingRelease(harness);
      const [test, ...rest] = sites;
      expect(await pinnedVersions(harness, [test.id])).toEqual([OLD.version]);
      expect((await liveManifest(harness.store, labelOf(test)))?.theme.version).toBe(OLD.version);
      const waiting = (await releaseShops(harness.db, release.id)).filter((shop) => shop.status === 'waiting');
      expect(waiting.map((shop) => shop.siteId).sort()).toEqual(rest.map((site) => site.id).sort());
      await approve(harness, release.id);
      await statusIs(harness, release.id, 'finished');
      const ids = sites.map((site) => site.id);
      expect(new Set(await pinnedVersions(harness, ids))).toEqual(new Set([OLD.version]));
      const switches =
        "SELECT count(*)::int AS n FROM site_theme_migrations WHERE to_version = '0.0.9' AND site_id::text = ANY($1)";
      expect((await harness.db.query<{ n: number }>(switches, [ids])).rows[0]?.n).toBe(5);
      expect(logged(harness.lines, 'release-wave').map((line) => line.wave)).toEqual([1, 2, 3]);
      const shops = await releaseShops(harness.db, release.id);
      expect(shops.filter((shop) => (shop.buildAfter ?? 0) <= (shop.buildBefore ?? 0))).toEqual([]);
      expect(fake.maxInFlight).toBe(1);
      expect(logged(harness.lines, 'ALERT')).toEqual([]);
    },
    LONG,
  );

  it(
    'автостоп по страницам: магазин волны 2 возвращён, выпуск stopped, одна тревога critical',
    async () => {
      const { harness } = await startStack();
      const { sites, release } = await awaitingRelease(harness);
      const [victim] = inWave(await releaseShops(harness.db, release.id), 2);
      const site = siteOf(sites, victim.siteId);
      const before = await liveBuild(harness, site);
      fake.brokenPages.add(labelOf(site));
      await approve(harness, release.id);
      await statusIs(harness, release.id, 'stopped');
      expect((await readRelease(harness.db, release.id))?.stopReason?.startsWith(site.id)).toBe(true);
      expect(await pinnedVersions(harness, [site.id])).toEqual([FAKE_THEME.version]);
      const pointer = await readPointer(harness.store, labelOf(site));
      expect({ build: pointer?.build, paused: pointer?.paused }).toEqual({ build: before, paused: false });
      const third = inWave(await releaseShops(harness.db, release.id), 3);
      expect(third.map((shop) => shop.status)).toEqual(['waiting', 'waiting']);
      expect(logged(harness.lines, 'ALERT')).toHaveLength(1);
      const message = await channel.get(activityQueue);
      if (message === false) throw new Error('записи site.release_stopped в журнале платформы нет');
      const envelope: unknown = JSON.parse(message.content.toString('utf8'));
      expect(envelope).toMatchObject({
        action: 'release_stopped',
        severity: 'critical',
        payload: { meta: { release: release.id } },
      });
    },
    LONG,
  );

  it(
    'паспорт «после» красный: магазин волны 1 — broken, verdict red, возвращён',
    async () => {
      const { harness } = await startStack();
      const { release } = await awaitingRelease(harness);
      const [victim] = inWave(await releaseShops(harness.db, release.id), 1);
      fake.red.add(victim.siteId);
      await approve(harness, release.id);
      await statusIs(harness, release.id, 'stopped');
      const row = (await releaseShops(harness.db, release.id)).find((shop) => shop.siteId === victim.siteId);
      expect({ status: row?.status, verdict: row?.verdict }).toEqual({ status: 'broken', verdict: 'red' });
      expect(await pinnedVersions(harness, [victim.siteId])).toEqual([FAKE_THEME.version]);
    },
    LONG,
  );

  it(
    'пропуски: пауза и смена темы — skipped с причинами, закрепления не тронуты, finished',
    async () => {
      const { harness } = await startStack();
      const { sites, release } = await awaitingRelease(harness);
      const shops = await releaseShops(harness.db, release.id);
      const [paused] = inWave(shops, 1);
      const [moved] = inWave(shops, 2);
      await changePointer(harness.store, labelOf(siteOf(sites, paused.siteId)), { kind: 'pause' });
      await harness.db.query("UPDATE site SET theme_id = 'flux' WHERE id = $1", [moved.siteId]);
      await approve(harness, release.id);
      await statusIs(harness, release.id, 'finished');
      const rows = await releaseShops(harness.db, release.id);
      const reasons = new Map(rows.map((row): [string, unknown[]] => [row.siteId, [row.status, row.error]]));
      expect(reasons.get(paused.siteId)).toEqual(['skipped', 'магазин на паузе']);
      expect(reasons.get(moved.siteId)).toEqual(['skipped', 'магазин сменил тему']);
      const pins = await pinnedVersions(harness, [paused.siteId, moved.siteId]);
      expect(pins).toEqual([FAKE_THEME.version, FAKE_THEME.version]);
    },
    LONG,
  );

  it(
    'сбой данных — не поломка: магазин ждёт повторов блока 6, выпуск доходит до finished',
    async () => {
      const { harness } = await startStack({ retryDelaysMs: [1_000, 2_000] });
      const { release } = await awaitingRelease(harness);
      const [victim] = inWave(await releaseShops(harness.db, release.id), 1);
      products.answers.set(victim.siteId, 'error');
      await approve(harness, release.id);
      await until(() => Promise.resolve(logged(harness.lines, 'release-shop-waits').length > 0), LONG);
      products.answers.delete(victim.siteId);
      await statusIs(harness, release.id, 'finished');
      expect(logged(harness.lines, 'ALERT')).toEqual([]);
    },
    LONG,
  );

  it(
    'перезапуск посреди волны: новый сборщик доводит выпуск до finished',
    async () => {
      const first = await startStack();
      const { release } = await awaitingRelease(first.harness);
      await approve(first.harness, release.id);
      const started = async () =>
        (await releaseShops(first.harness.db, release.id)).some((shop) => shop.wave > 0 && shop.status !== 'waiting');
      await until(started, LONG);
      open.splice(open.indexOf(first), 1);
      await stopStack(first);
      const second = await startStack();
      await second.conductor.resume();
      await statusIs(second.harness, release.id, 'finished');
      const statuses = (await releaseShops(second.harness.db, release.id)).map((shop) => shop.status);
      expect(new Set(statuses)).toEqual(new Set(['done']));
    },
    LONG,
  );

  it(
    'выдержка между волнами: волна 2 — не раньше next_wave_at, пока ждём — next_wave_at записан',
    async () => {
      const { harness } = await startStack({ pauseMs: 2_000 });
      const { release } = await awaitingRelease(harness);
      await approve(harness, release.id);
      const seen = { due: new Date(0), at: 0 };
      await until(async () => {
        const row = await readRelease(harness.db, release.id);
        if (row?.wave !== 1 || row.nextWaveAt === null) return false;
        seen.due = row.nextWaveAt;
        seen.at = Date.now();
        return true;
      }, LONG);
      await until(async () => (await readRelease(harness.db, release.id))?.wave === 2, LONG);
      expect(Date.now()).toBeGreaterThanOrEqual(seen.due.getTime());
      expect(seen.due.getTime() - seen.at).toBeGreaterThan(1_000);
      await statusIs(harness, release.id, 'finished');
    },
    LONG,
  );

  it(
    'правка во время выпуска: магазин волны 3 до своей волны собран на 0.0.1, после finished — на 0.0.9',
    async () => {
      const { harness } = await startStack();
      const { sites, release } = await awaitingRelease(harness);
      const [late] = inWave(await releaseShops(harness.db, release.id), 3);
      const site = siteOf(sites, late.siteId);
      const before = await liveBuild(harness, site);
      await harness.db.query("UPDATE site SET name = 'Шарфы и варежки' WHERE id = $1", [site.id]);
      await harness.broker.publishEvent(editEvent(site.id));
      await until(async () => (await liveBuild(harness, site)) > before, LONG);
      expect((await liveManifest(harness.store, labelOf(site)))?.theme.version).toBe(FAKE_THEME.version);
      await approve(harness, release.id);
      await statusIs(harness, release.id, 'finished');
      expect((await liveManifest(harness.store, labelOf(site)))?.theme.version).toBe(OLD.version);
    },
    LONG,
  );
});
