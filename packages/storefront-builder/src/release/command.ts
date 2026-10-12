import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  comparePassports,
  compareShots,
  parseRules,
  parseThresholds,
  shotFileName,
  verdictOf,
  type Passport,
  type Shot,
  type ShotDifference,
} from '@merfy/stand-check';
import { releaseShotKey, type ObjectStore, type S3StoreOptions } from '@merfy/storefront-storage';
import { compareVersions } from '@merfy/tokens';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from '../errors';
import { parseWith } from '../parse';
import { readRendererIndex } from '../renderer-archive';
import type { Database } from '../shop-state';
import { readShop, shopAddress } from '../snapshot';
import { revertShop } from './conductor';
import { dryRun, type DryRun, type ShopEdits, type VersionFiles } from './dry-run';
import { KINDS } from './kinds';
import { renderReleaseReport, type ReleaseReport, type ShotLink } from './report';
import {
  createRelease,
  notifyRelease,
  readRelease,
  releaseShops,
  releasedVersion,
  setRelease,
  setShop,
  type NewRelease,
  type ReleaseRow,
  type ReleaseShopRow,
  type ReleaseStatus,
  type ShopPatch,
  type ShopStatus,
} from './store';
import { repoVersion, themeShops } from './versions';
import { planWaves } from './waves';

// Команда выпуска темы (design.md блока 10, «Команда выпуска»): скрипт в site-gen, как поезд выпуска. Браузер — у того,
// кто запускает: паспорт и снимки тестового магазина до и после. Волны ведёт сборщик на сервере; команда заводит
// выпуск, ждёт волну 0, пишет отчёт, записывает «да», снимает магазин и возвращает всех.

export interface Browser {
  passport: (url: string) => Promise<Passport>;
  shots: (url: string) => Promise<Shot[]>;
}

export interface CommandDeps {
  db: Database;
  store: ObjectStore;
  contour: 'dev' | 'prod';
  root: string;
  reportDir: string;
  publicUrl: string;
  startedBy: string;
  clock: () => Date;
  say: (line: string) => void;
  browser: Browser;
  versions: (themeId: string, version: string) => Promise<VersionFiles>;
  pollMs: number;
  waitMs: number;
}

export interface CommandSettings {
  databaseUrl: string;
  s3: S3StoreOptions;
  publicUrl: string;
  contour: 'dev' | 'prod';
}

export const EXIT = { done: 0, refused: 1 } as const;
const STAND_RULES = 'packages/stand-check/compare-rules.json';
const THRESHOLDS = 'visual-diff-thresholds.json';
const TESTING_SETTLED: ReadonlySet<ReleaseStatus> = new Set(['awaiting', 'stopped', 'finished']);
const SKIPPABLE: readonly ShopStatus[] = ['waiting', 'before', 'building', 'checking'];
const OPEN: readonly ShopStatus[] = ['waiting', 'before', 'building', 'checking', 'done', 'broken'];
// Новой версии ещё не было: «ждёт» и «до» уходят пропуском. Закреплён (или был) — уходит с откатом.
const NOT_UPDATED: ReadonlySet<ShopStatus> = new Set(['waiting', 'before']);
const PINNED: ReadonlySet<ShopStatus> = new Set(['building', 'checking', 'done', 'broken']);
const NOT_REVERTED: readonly ReleaseStatus[] = [
  'planning',
  'queued',
  'testing',
  'awaiting',
  'waves',
  'stopped',
  'finished',
];
const IN_BUILD_NOTE =
  'собирался в миг возврата: если эта сборка выложит новую версию, сверка сборщика раз в час пересоберёт его на прежней';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // Адрес, по которому storefront/ открывается без подписи (как у раздачи): ссылки на снимки в отчёте.
  S3_PUBLIC_URL: z.url(),
  STOREFRONT_CONTOUR: z.enum(['dev', 'prod']).default('dev'),
});

export function readCommandSettings(env: NodeJS.ProcessEnv): CommandSettings {
  const value = parseWith(envSchema, env, 'settings-invalid', 'env');
  const s3 = {
    endpoint: value.S3_ENDPOINT,
    bucket: value.S3_BUCKET,
    accessKeyId: value.S3_ACCESS_KEY,
    secretAccessKey: value.S3_SECRET_KEY,
  };
  return {
    databaseUrl: value.DATABASE_URL,
    s3,
    publicUrl: value.S3_PUBLIC_URL.replace(/\/$/, ''),
    contour: value.STOREFRONT_CONTOUR,
  };
}

const releaseId = z.coerce.number().int().positive();
const commandSchema = z.union([
  z
    .object({
      name: z.literal('start'),
      rest: z.tuple([z.string().min(1)]),
      'test-shop': z.string().min(1).optional(),
      version: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .optional(),
      'no-shots': z.boolean(),
      'expect-hash': z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/)
        .optional(),
    })
    .transform((value) => ({
      name: value.name,
      theme: value.rest[0],
      testShop: value['test-shop'] ?? null,
      version: value.version ?? null,
      shots: !value['no-shots'],
      expectHash: value['expect-hash'] ?? null,
    })),
  z
    .object({ name: z.literal('approve'), rest: z.tuple([releaseId]) })
    .transform((value) => ({ name: value.name, release: value.rest[0] })),
  z
    .object({ name: z.literal('status'), rest: z.union([z.tuple([releaseId]), z.tuple([])]) })
    .transform((value) => ({ name: value.name, release: value.rest[0] ?? null })),
  z
    .object({ name: z.literal('skip'), rest: z.tuple([releaseId, z.string().min(1)]) })
    .transform((value) => ({ name: value.name, release: value.rest[0], shop: value.rest[1] })),
  z
    .object({ name: z.literal('revert-all'), rest: z.tuple([releaseId]) })
    .transform((value) => ({ name: value.name, release: value.rest[0] })),
]);

export type Command = z.output<typeof commandSchema>;
type StartCommand = Extract<Command, { name: 'start' }>;

const OPTIONS = {
  'test-shop': { type: 'string' },
  version: { type: 'string' },
  'no-shots': { type: 'boolean', default: false },
  'expect-hash': { type: 'string' },
} as const;

function argsOf(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new StorefrontBuilderError('release-args', errorText(error));
  }
}

// theme-release <подкоманда> …: разбор node:util, проверка схемой.
export function parseCommand(argv: readonly string[]): Command {
  const { values, positionals } = argsOf(argv);
  const [name, ...rest] = positionals;
  return parseWith(commandSchema, { ...values, name, rest }, 'release-args', 'theme-release');
}

const refuse = (text: string): StorefrontBuilderError => new StorefrontBuilderError('release-refused', text);
const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'));

interface Prepared {
  theme: string;
  from: string;
  to: string;
  toHash: string;
  shops: ShopEdits[];
  dry: DryRun;
}

// Что выпускаем и можно ли: «с» — выпущенная на контуре, «на» — рабочей копии или --version; архив «на» есть;
// отпечаток совпал (на проде — обязательно); сухой прогон по всем опубликованным магазинам темы.
async function prepare(deps: CommandDeps, command: StartCommand): Promise<Prepared> {
  const { theme, expectHash } = command;
  const to = command.version ?? (await repoVersion(deps.root, theme));
  const from = await releasedVersion(deps.db, theme, deps.contour);
  if (from === null) throw refuse(`выпусков ${theme} на ${deps.contour} нет: сборщик с блоком 10 ещё не стартовал`);
  if (compareVersions(to, from) <= 0) throw refuse(`версия ${to} не новее выпущенной ${from}; откат — revert-all`);
  const entry = (await readRendererIndex(deps.store, theme)).versions[to];
  if (entry === undefined)
    throw refuse(`архива ${theme} ${to} нет: сборщик с этой версией не стартовал на ${deps.contour}`);
  if (deps.contour === 'prod' && expectHash === null)
    throw refuse('на проде нужен --expect-hash: отпечаток из выпуска на dev');
  if (expectHash !== null && expectHash !== entry.contentHash)
    throw refuse(`отпечаток ${to} — ${entry.contentHash}, а ждали ${expectHash}`);
  const shops = await themeShops(deps.db, theme);
  const dry = dryRun(await deps.versions(theme, from), await deps.versions(theme, to), shops);
  return { theme, from, to, toHash: entry.contentHash, shops, dry };
}

const newRelease = (deps: CommandDeps, prepared: Prepared): NewRelease => ({
  kind: 'theme',
  subject: prepared.theme,
  fromVersion: prepared.from,
  toVersion: prepared.to,
  toHash: prepared.toHash,
  contour: deps.contour,
  startedBy: deps.startedBy,
  status: 'testing',
});

const baseReport = (deps: CommandDeps, prepared: Prepared, release: number | null, status: string): ReleaseReport => ({
  release,
  theme: prepared.theme,
  from: prepared.from,
  to: prepared.to,
  toHash: prepared.toHash,
  contour: deps.contour,
  status,
  dryRun: prepared.dry,
  testShop: null,
  conductorVerdict: null,
  passport: null,
  shots: null,
});

// Отчёт и паспорта — в репозитории (design.md: «паспорта и отчёт — в репозитории»); коммитит человек.
async function saveReport(deps: CommandDeps, report: ReleaseReport, passports: readonly Passport[]): Promise<string> {
  const dir = join(deps.reportDir, deps.contour, `${report.release ?? 'dry'}-${report.theme}-${report.to}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.md'), renderReleaseReport(report));
  const names = ['before.json', 'after.json'];
  await Promise.all(
    passports.map((passport, index) => writeFile(join(dir, names[index]), `${JSON.stringify(passport, null, 2)}\n`)),
  );
  return join(dir, 'report.md');
}

async function refusedByDryRun(deps: CommandDeps, prepared: Prepared): Promise<number> {
  const file = await saveReport(deps, baseReport(deps, prepared, null, 'не стартовал'), []);
  deps.say(`Сухой прогон красный: выпуск не стартует. Отчёт: ${file}`);
  return EXIT.refused;
}

// Магазинов темы на контуре нет (прод этапа): выпуск сразу finished — новые магазины получат новую версию.
async function releaseEmpty(deps: CommandDeps, prepared: Prepared): Promise<number> {
  const release = await createRelease(deps.db, { ...newRelease(deps, prepared), status: 'finished' }, () => []);
  const file = await saveReport(deps, baseReport(deps, prepared, release.id, 'finished'), []);
  deps.say(`Магазинов ${prepared.theme} на ${deps.contour} нет: выпуск №${release.id} сразу finished. Отчёт: ${file}`);
  return EXIT.done;
}

interface Observation {
  passport: Passport;
  shots: Shot[];
}

const observe = async (deps: CommandDeps, url: string, shots: boolean): Promise<Observation> => ({
  passport: await deps.browser.passport(url),
  shots: shots ? await deps.browser.shots(url) : [],
});

async function shopUrl(deps: CommandDeps, siteId: string): Promise<string> {
  const shop = await readShop(deps.db, siteId);
  if (shop === null) throw refuse(`магазина ${siteId} нет`);
  return shopAddress(shop).url;
}

// Ждём волну 0: ведущий не сообщает о своих переходах — опрос базы раз в pollMs, не дольше waitMs.
async function waitTesting(deps: CommandDeps, id: number): Promise<ReleaseRow> {
  const deadline = deps.clock().getTime() + deps.waitMs;
  for (;;) {
    const release = await readRelease(deps.db, id);
    if (release !== null && TESTING_SETTLED.has(release.status)) return release;
    if (deps.clock().getTime() > deadline)
      throw refuse(`волна 0 выпуска №${id} не закончилась: смотри status и журнал сборщика`);
    await new Promise((resolve) => setTimeout(resolve, deps.pollMs));
  }
}

const shotOf = (shots: readonly Shot[], difference: ShotDifference): Buffer | null =>
  shots.find((shot) => shot.page === difference.page && shot.width === difference.width)?.png ?? null;

// Снимок — в MinIO под storefront/release-shots/<выпуск>/: открывается по ссылке, как файлы витрин.
async function upload(deps: CommandDeps, release: number, name: string, png: Buffer | null): Promise<string | null> {
  if (png === null) return null;
  const key = releaseShotKey(release, name);
  await deps.store.write(key, png, { contentType: 'image/png' });
  return `${deps.publicUrl}/${key}`;
}

interface ShotPair {
  release: number;
  theme: string;
  before: Observation;
  after: Observation;
}

async function shotLinks(deps: CommandDeps, pair: ShotPair): Promise<ShotLink[]> {
  const thresholds = parseThresholds(await readJson(join(deps.root, THRESHOLDS)));
  const differences = compareShots(pair.theme, pair.before.shots, pair.after.shots, thresholds);
  return Promise.all(
    differences.map(async (difference) => ({
      title: `${difference.page}, ${difference.width} px`,
      before: await upload(
        deps,
        pair.release,
        `before-${shotFileName(difference)}`,
        shotOf(pair.before.shots, difference),
      ),
      after: await upload(
        deps,
        pair.release,
        `after-${shotFileName(difference)}`,
        shotOf(pair.after.shots, difference),
      ),
      diff: await upload(deps, pair.release, `diff-${shotFileName(difference)}`, difference.diff),
      ratio: difference.ratio,
      threshold: difference.threshold,
      over: difference.over,
    })),
  );
}

interface TestRun {
  prepared: Prepared;
  release: ReleaseRow;
  testShop: string;
  before: Observation;
  after: Observation;
}

async function testReport(deps: CommandDeps, run: TestRun): Promise<number> {
  const { prepared, release, testShop, before, after } = run;
  const row = (await releaseShops(deps.db, release.id)).find((shop) => shop.siteId === testShop);
  const rules = parseRules(await readJson(join(deps.root, STAND_RULES)));
  const differences = comparePassports(before.passport, after.passport, rules);
  const pair = { release: release.id, theme: prepared.theme, before, after };
  const report: ReleaseReport = {
    ...baseReport(deps, prepared, release.id, release.status),
    testShop,
    conductorVerdict: row?.verdict ?? null,
    passport: { verdict: verdictOf(differences), differences },
    shots: before.shots.length === 0 ? null : await shotLinks(deps, pair),
  };
  deps.say(`Отчёт: ${await saveReport(deps, report, [before.passport, after.passport])}`);
  if (release.status === 'awaiting') return EXIT.done;
  deps.say(`Выпуск №${release.id}: ${release.status}${release.stopReason === null ? '' : ` — ${release.stopReason}`}`);
  return EXIT.refused;
}

// start: сухой прогон → паспорт и снимки «до» → выпуск testing (волна 0 — тестовый магазин) → ждём сборщик → «после» →
// отчёт. Красный прогон — выпуска нет; магазинов темы нет — выпуск сразу finished.
async function start(deps: CommandDeps, command: StartCommand): Promise<number> {
  const prepared = await prepare(deps, command);
  if (prepared.dry.red) return refusedByDryRun(deps, prepared);
  if (prepared.shops.length === 0) return releaseEmpty(deps, prepared);
  const testShop = command.testShop;
  if (testShop === null || !prepared.shops.some((shop) => shop.siteId === testShop))
    throw refuse('нужен --test-shop: опубликованный магазин этой темы на контуре');
  const url = await shopUrl(deps, testShop);
  const before = await observe(deps, url, command.shots);
  const ids = prepared.shops.map((shop) => shop.siteId);
  const created = await createRelease(deps.db, newRelease(deps, prepared), (id) => planWaves(ids, testShop, id));
  deps.say(
    `Выпуск №${created.id}: ${prepared.theme} ${prepared.from} → ${prepared.to}; волна 0 — ${testShop}, жду сборщик`,
  );
  const release = await waitTesting(deps, created.id);
  const after = await observe(deps, url, command.shots);
  return testReport(deps, { prepared, release, testShop, before, after });
}

// «Да» человека (П10-2 В): awaiting → waves без выдержки; NOTIFY будит ведущего.
async function approve(deps: CommandDeps, id: number): Promise<number> {
  const moved = await setRelease(deps.db, id, ['awaiting'], { status: 'waves', nextWaveAt: deps.clock() });
  if (!moved) {
    deps.say(`Выпуск №${id} не ждёт «да»: состояние ${(await readRelease(deps.db, id))?.status ?? 'нет такого'}`);
    return EXIT.refused;
  }
  await notifyRelease(deps.db, id);
  deps.say(`Выпуск №${id}: «да» записано, волны 1–3 ведёт сборщик`);
  return EXIT.done;
}

const LATEST_SQL = 'SELECT id FROM storefront_release WHERE contour = $1 ORDER BY id DESC LIMIT 1';
const idRow = z.object({ id: z.number() });

async function status(deps: CommandDeps, id: number | null): Promise<number> {
  const latest = (await deps.db.query(LATEST_SQL, [deps.contour])).rows.map((row) => idRow.parse(row).id).at(0) ?? null;
  const release = await readRelease(deps.db, id ?? latest ?? 0);
  if (release === null) throw refuse(`выпуска ${id ?? 'на контуре'} нет`);
  const reason = release.stopReason === null ? '' : `; ${release.stopReason}`;
  deps.say(
    `№${release.id} ${release.kind} ${release.subject} ${release.fromVersion} → ${release.toVersion}: ${release.status}, волна ${release.wave}${reason}`,
  );
  for (const shop of await releaseShops(deps.db, release.id)) {
    deps.say(`  волна ${shop.wave} ${shop.siteId}: ${shop.status}${shop.error === null ? '' : ` — ${shop.error}`}`);
  }
  return EXIT.done;
}

interface Moved {
  moved: boolean;
  problem: string | null;
}

// Магазин из прочитанного состояния: сначала строка (ведущий её больше не возьмёт), потом откат закреплённого.
async function moveShop(
  deps: CommandDeps,
  release: ReleaseRow,
  shop: ReleaseShopRow,
  patch: ShopPatch,
): Promise<Moved> {
  const key = { releaseId: release.id, siteId: shop.siteId };
  if (!(await setShop(deps.db, key, [shop.status], patch))) return { moved: false, problem: null };
  if (!PINNED.has(shop.status)) return { moved: true, problem: null };
  return { moved: true, problem: await revertShop(deps, release, shop) };
}

// Снять магазин: закреплённый уже — вернуть, как при поломке, но выпуск идёт дальше.
async function skip(deps: CommandDeps, id: number, siteId: string): Promise<number> {
  const release = await readRelease(deps.db, id);
  const shop = (await releaseShops(deps.db, id)).find((row) => row.siteId === siteId);
  if (release === null || shop === undefined) throw refuse(`в выпуске №${id} нет магазина ${siteId}`);
  if (!SKIPPABLE.includes(shop.status))
    throw refuse(`магазин ${siteId} уже ${shop.status}: снять можно до конца проверки`);
  const { moved, problem } = await moveShop(deps, release, shop, { status: 'skipped', error: 'снят человеком' });
  if (!moved) throw refuse(`магазин ${siteId} только что сменил состояние — повтори команду`);
  await notifyRelease(deps.db, id);
  deps.say(`Магазин ${siteId} снят с выпуска №${id} (был ${shop.status})${problem === null ? '' : `; ${problem}`}`);
  if (shop.status === 'building') deps.say(`  ${siteId} ${IN_BUILD_NOTE}`);
  return problem === null ? EXIT.done : EXIT.refused;
}

interface Returned {
  shop: ReleaseShopRow;
  problem: string | null;
}

async function revertPass(deps: CommandDeps, release: ReleaseRow): Promise<Returned[]> {
  const shops = (await releaseShops(deps.db, release.id)).filter((shop) => OPEN.includes(shop.status));
  const returned: Returned[] = [];
  for (const shop of shops) {
    const patch: ShopPatch = NOT_UPDATED.has(shop.status)
      ? { status: 'skipped', error: 'выпуск возвращён' }
      : { status: 'reverted' };
    const result = await moveShop(deps, release, shop, patch);
    if (result.moved) returned.push({ shop, problem: result.problem });
  }
  return returned;
}

const PIN_LEFT_SQL = `SELECT s.site_id FROM storefront_release_shop s JOIN site ON site.id = s.site_id
  WHERE s.release_id = $1 AND s.status = 'reverted' AND site.theme_version = $2`;
const siteRow = z.object({ site_id: z.string() });

// Закрепление, пришедшее после отката: шаг ведущего, начатый до команды, мог закрепить магазин уже после неё.
async function pinLeftovers(deps: CommandDeps, release: ReleaseRow): Promise<Returned[]> {
  if (!KINDS[release.kind].pin) return [];
  const { rows } = await deps.db.query(PIN_LEFT_SQL, [release.id, release.toVersion]);
  const ids = new Set(rows.map((row) => siteRow.parse(row).site_id));
  const shops = (await releaseShops(deps.db, release.id)).filter((shop) => ids.has(shop.siteId));
  return Promise.all(shops.map(async (shop) => ({ shop, problem: await revertShop(deps, release, shop) })));
}

// Вернуть всех (П10-4 А): выпуск reverted первым — ведущий его больше не двигает; магазины — два прохода, затем сверка
// закреплений. Повтор команды безвреден.
async function revertAll(deps: CommandDeps, id: number): Promise<number> {
  const release = await readRelease(deps.db, id);
  if (release === null) throw refuse(`выпуска №${id} нет`);
  await setRelease(deps.db, id, NOT_REVERTED, { status: 'reverted' });
  await notifyRelease(deps.db, id);
  const returned = [...(await revertPass(deps, release)), ...(await revertPass(deps, release))];
  const left = await pinLeftovers(deps, release);
  const problems = [...returned, ...left].flatMap(({ shop, problem }) =>
    problem === null ? [] : [`  ${shop.siteId}: ${problem}`],
  );
  const building = returned
    .filter(({ shop }) => shop.status === 'building')
    .map(({ shop }) => `  ${shop.siteId} ${IN_BUILD_NOTE}`);
  for (const line of [...problems, ...building]) deps.say(line);
  deps.say(
    `Выпуск №${id} reverted: магазинов возвращено или снято — ${returned.length}, закреплений поправлено — ${left.length}`,
  );
  return problems.length === 0 ? EXIT.done : EXIT.refused;
}

export function runCommand(deps: CommandDeps, command: Command): Promise<number> {
  if (command.name === 'start') return start(deps, command);
  if (command.name === 'approve') return approve(deps, command.release);
  if (command.name === 'status') return status(deps, command.release);
  if (command.name === 'skip') return skip(deps, command.release, command.shop);
  return revertAll(deps, command.release);
}
