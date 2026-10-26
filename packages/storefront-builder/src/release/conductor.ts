import { publishSection } from '@merfy/storefront-sections';
import { changePointer, hexOf, readPointer, type ObjectStore, type Pointer } from '@merfy/storefront-storage';
import { z } from 'zod';
import { raiseReleaseStopped } from './alert';
import type { CheckJob, CheckResult } from './checks';
import { planExtensionRelease, type ExtensionDeps } from './extension';
import { KINDS, isBreakage } from './kinds';
import type { PageCheck, PageExpectation } from './page-check';
import {
  ACTIVE_STATUSES,
  activeReleases,
  activeShopOf,
  notifyRelease,
  queuedReleases,
  readRelease,
  recordThemeSwitch,
  setRelease,
  setShop,
  waveShops,
  type ReleaseRow,
  type ReleaseShopRow,
  type ShopPatch,
  type ShopStatus,
} from './store';
import type { PublishActivity } from '../alert';
import type { BuildOutcome } from '../build-record';
import { StorefrontBuilderError, errorText } from '../errors';
import type { ContentEvent } from '../events';
import { liveManifest } from '../live';
import type { Log } from '../log';
import type { Database, Queryable } from '../shop-state';
import { readShop, shopAddress } from '../snapshot';

// Ведущий волн (design.md блока 10, раздел 4): волна → паспорт «до» → закрепление и событие выпуска → сборка в очереди
// сборщика (приоритет «выпуск», не больше K) → «дошёл до версии» по манифесту → страницы без браузера → паспорт «после»
// → done. Первая поломка возвращает этот магазин и останавливает выпуск (П10-4 А). Состояние — в базе, переходы —
// условные; ведущий просыпается от NOTIFY, конца сборки, ответа проверки и таймера выдержки.

export interface ConductorDeps {
  db: Database;
  store: ObjectStore;
  contour: string;
  // Сколько магазинов волны в работе сразу (K, RELEASE_SLOTS): паспорт «до» снимается перед самой сборкой.
  window: number;
  pauseMs: number;
  clock: () => Date;
  log: Log;
  publishEvent: (event: ContentEvent) => Promise<void>;
  publishCheck: (job: CheckJob) => Promise<void>;
  publishActivity: PublishActivity;
  pageCheck: (url: string, expected: PageExpectation) => Promise<PageCheck>;
  // Выпуски платформы и расширения (задача 11): магазины новых тем, тестовый магазин, расширения магазина.
  themeIds: readonly string[];
  testShop: string | null;
  enabledExtensions: ExtensionDeps['enabledExtensions'];
  // Отпечаток кода платформы этого сборщика (П10-7 А): выпуск платформы с другим to_hash ведёт сборщик того кода.
  renderHash: string;
}

// Чем откатывает команда выпуска (задача 10): ей нужны только база и хранилище.
export type ShopDeps = Pick<ConductorDeps, 'db' | 'store'>;

export interface FinishedBuild {
  siteId: string;
  build: number;
  outcome: BuildOutcome;
  code: string | null;
  error: string | null;
}

export interface Conductor {
  advance(): Promise<void>;
  resume(): Promise<void>;
  afterBuild(build: FinishedBuild): Promise<void>;
  onCheckResult(result: CheckResult): Promise<void>;
  // Только таймеры — ведущий «умер» (тест перезапуска): шаги доделает resume следующего запуска.
  stop(): void;
  // Штатная остановка сборщика (SIGTERM, main.ts): новых шагов не брать, идущий доделать — не дольше limitMs.
  shutdown(limitMs: number): Promise<void>;
}

interface Step {
  deps: ConductorDeps;
  schedule: (due: Date) => void;
}

interface Target {
  url: string;
  label: string;
  pointer: Pointer | null;
  skip: string | null;
}

const RESUME_AFTER_FAILURE_MS = 30_000;
const STOPPED = 'ведущий волн остановлен: шаг не начат';
const IN_FLIGHT: readonly ShopStatus[] = ['before', 'building', 'checking'];
const SETTLED: ReadonlySet<ShopStatus> = new Set(['done', 'skipped']);
const SKIP = {
  missing: 'магазина нет',
  unpublished: 'магазин снят с публикации',
  theme: 'магазин сменил тему',
  address: 'у магазина нет адреса',
  build: 'у магазина нет живой сборки',
  paused: 'магазин на паузе',
  unchanged: 'сборка не изменилась: новый код платформы этот магазин не меняет',
  // Выпуск нашей секции (часть 15з): текущая правка секции магазина — уже не та, что записала команда.
  sectionChanged: 'мерчант изменил секцию после записи: его правка остаётся, выпуск её не трогает',
} as const;
const keyOf = (shop: ReleaseShopRow) => ({ releaseId: shop.releaseId, siteId: shop.siteId });
const skipped = (reason: string): Target => ({ url: '', label: '', pointer: null, skip: reason });

// Чужой выпуск (П10-7 А) — выпуск платформы с другим кодом: при выкатке «rolling» секунды работают старый и новый
// сборщик, и старый своим кодом записал бы магазинам «сборка не изменилась». Его шаги делает только сборщик с этим
// кодом. Выпуски темы и расширения рисуют архивы из MinIO — код платформы им не важен, их ведёт любой.
const isForeign = (deps: ConductorDeps, release: ReleaseRow): boolean =>
  release.kind === 'platform' && release.toHash !== deps.renderHash;

async function ownReleases(deps: ConductorDeps): Promise<ReleaseRow[]> {
  return (await activeReleases(deps.db, deps.contour)).filter((release) => !isForeign(deps, release));
}

// Ответ проверки по идущему чужому выпуску — ошибка release-foreign: брокер вернёт ответ в очередь (broker.ts,
// deliver), его возьмёт сборщик того кода. Проверка — до очереди шагов: упавший шаг завёл бы сверку через 30 с. Тот
// сборщик умер (край — в build-job.ts, refuseForeign) — ответ ходит по кругу раз в секунду до следующего старта.
async function refuseForeign(deps: ConductorDeps, result: CheckResult): Promise<void> {
  const release = await readRelease(deps.db, result.release);
  if (release === null || !ACTIVE_STATUSES.includes(release.status) || !isForeign(deps, release)) return;
  const text = `ответ проверки выпуска платформы ${release.id} — сборщику с его кодом`;
  throw new StorefrontBuilderError('release-foreign', text, { path: `site/${result.siteId}` });
}

// Магазин волны: адрес, указатель и причина пропустить. Пропуск — не поломка: волна идёт дальше.
async function targetOf(deps: ShopDeps, release: ReleaseRow, siteId: string): Promise<Target> {
  const shop = await readShop(deps.db, siteId);
  if (shop === null) return skipped(SKIP.missing);
  const early = [
    [shop.status !== 'published', SKIP.unpublished],
    [release.kind === 'theme' && shop.themeId !== release.subject, SKIP.theme],
    [shop.publicUrl === null || shop.publicUrl === '', SKIP.address],
  ] as const;
  const reason = early.find(([hit]) => hit)?.[1];
  if (reason !== undefined) return skipped(reason);
  const address = shopAddress(shop);
  const pointer = await readPointer(deps.store, address.label);
  const late = [
    [pointer === null, SKIP.build],
    [pointer?.paused === true, SKIP.paused],
  ] as const;
  return { ...address, pointer, skip: late.find(([hit]) => hit)?.[1] ?? null };
}

const pinnedRow = z.object({ theme_version: z.string().nullable() });
const PIN_SQL = 'UPDATE site SET theme_version = $3 WHERE id = $1 AND theme_id = $2';

async function pinnedVersion(db: Queryable, siteId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT theme_version FROM site WHERE id = $1', [siteId]);
  return rows.map((row) => pinnedRow.parse(row).theme_version).at(0) ?? null;
}

// Закрепление версии темы (выпуск, откат) и строка в site_theme_migrations. Уже так закреплено или магазин сменил тему —
// ничего не пишет: повтор шага безвреден. null — пустое закрепление: магазин возьмёт выпущенную версию (задача 4).
async function pinVersion(deps: ShopDeps, release: ReleaseRow, siteId: string, version: string | null, reason: string) {
  const previous = await pinnedVersion(deps.db, siteId);
  if (previous === version) return;
  const { rowCount } = await deps.db.query(PIN_SQL, [siteId, release.subject, version]);
  if ((rowCount ?? 0) === 0) return;
  const report = { release: release.id, wave: release.wave, reason };
  const [from, to] = [previous ?? release.fromVersion, version ?? release.fromVersion];
  await recordThemeSwitch(deps.db, { siteId, themeId: release.subject, from, to, report });
}

const event = (deps: ConductorDeps, type: string, siteId: string): ContentEvent => ({
  type,
  siteId,
  eventAt: deps.clock().toISOString(),
  source: 'storefront-release',
});

const afterJob = (release: ReleaseRow, shop: ReleaseShopRow, url: string, home: string | null): CheckJob => ({
  v: 1,
  release: release.id,
  siteId: shop.siteId,
  phase: 'after',
  url,
  before: shop.passportBefore,
  ...(home === null ? {} : { expected: { home } }),
});

// Признак новой сборки для проверок: отпечаток файла главной из манифеста живой сборки (ETag раздачи). Главная — не
// страница манифеста (платформенные 404/502, спецстраницы) или манифеста нет — null, ожидания не будет.
async function homeHexOf(store: ObjectStore, label: string): Promise<string | null> {
  const manifest = await liveManifest(store, label);
  const hash = manifest?.pages.find((page) => page.path === '/')?.hash ?? null;
  return hash === null ? null : hexOf(hash);
}

// Пропуск — из того состояния, в котором магазин прочитан: гонка с другим шагом даст false.
async function skipShop(step: Step, release: ReleaseRow, shop: ReleaseShopRow, reason: string): Promise<void> {
  if (!(await setShop(step.deps.db, keyOf(shop), [shop.status], { status: 'skipped', error: reason }))) return;
  step.deps.log('release-shop-skipped', { release: release.id, shopId: shop.siteId, reason });
}

// Магазин уходит из волны пропуском — место в окне свободно, волна идёт дальше.
async function leaveWave(step: Step, release: ReleaseRow, shop: ReleaseShopRow, reason: string): Promise<void> {
  await skipShop(step, release, shop, reason);
  await advanceRelease(step, release);
}

// Ждущий магазин в работу: задание на паспорт «до». Вернёт, занял ли он место в окне.
async function requestBefore(step: Step, release: ReleaseRow, shop: ReleaseShopRow): Promise<boolean> {
  const { deps } = step;
  const target = await targetOf(deps, release, shop.siteId);
  if (target.skip !== null) {
    await skipShop(step, release, shop, target.skip);
    return false;
  }
  if (!(await setShop(deps.db, keyOf(shop), ['waiting'], { status: 'before' }))) return false;
  await deps.publishCheck({ v: 1, release: release.id, siteId: shop.siteId, phase: 'before', url: target.url });
  deps.log('release-shop-before', { release: release.id, shopId: shop.siteId, wave: shop.wave });
  return true;
}

// Волна: свободные места окна — ждущим магазинам; все магазины волны done или skipped — волна закончена.
// Выпуск расширения: planning → магазины и волны → testing, дальше — как у темы, без «да» (задача 11).
async function planExtension(step: Step, release: ReleaseRow): Promise<void> {
  if (!(await planExtensionRelease(step.deps, release))) return;
  const planned = await readRelease(step.deps.db, release.id);
  if (planned !== null) await advanceRelease(step, planned);
}

async function advanceRelease(step: Step, release: ReleaseRow): Promise<void> {
  if (release.status === 'planning') return planExtension(step, release);
  if (release.status !== 'testing' && release.status !== 'waves') return;
  const shops = await waveShops(step.deps.db, release.id, release.wave);
  let free = step.deps.window - shops.filter((shop) => IN_FLIGHT.includes(shop.status)).length;
  for (const shop of shops.filter((candidate) => candidate.status === 'waiting')) {
    if (free <= 0) break;
    if (await requestBefore(step, release, shop)) free -= 1;
  }
  const settled = (await waveShops(step.deps.db, release.id, release.wave)).every((shop) => SETTLED.has(shop.status));
  if (settled) await finishWave(step, release);
}

const NEXT_WAVE_SQL = 'SELECT min(wave) AS wave FROM storefront_release_shop WHERE release_id = $1 AND wave > $2';
const BUMP_SQL = `UPDATE storefront_release SET wave = $3, next_wave_at = NULL, updated_at = now()
  WHERE id = $1 AND wave = $2 AND status = 'waves'`;
const nextWaveRow = z.object({ wave: z.number().nullable() });

async function nextWaveOf(db: Queryable, release: ReleaseRow): Promise<number | null> {
  const { rows } = await db.query(NEXT_WAVE_SQL, [release.id, release.wave]);
  return rows.map((row) => nextWaveRow.parse(row).wave).at(0) ?? null;
}

// Следующая волна — условно: второй обработчик или устаревшая строка выпуска получат false.
async function bumpWave(db: Queryable, release: ReleaseRow, next: number): Promise<boolean> {
  return ((await db.query(BUMP_SQL, [release.id, release.wave, next])).rowCount ?? 0) > 0;
}

// Конец выпуска будит всех ведущих (NOTIFY): ждущий выпуск может быть чужим (П10-7 А) — его запустит сборщик того
// кода. Переход условный, NOTIFY — один на выпуск.
async function finishRelease(step: Step, release: ReleaseRow): Promise<void> {
  if (!(await setRelease(step.deps.db, release.id, ['testing', 'waves'], { status: 'finished' }))) return;
  step.deps.log('release-finished', { release: release.id, kind: release.kind, to: release.toVersion });
  await notifyRelease(step.deps.db, release.id);
  await startQueued(step);
}

// Следующая волна — после выдержки (dev — 0, прод — час): не назначена — назначить и поставить таймер; идёт — таймер;
// прошла — волна. «Да» человека (задача 10) ставит next_wave_at = сейчас: после тестового магазина выдержки нет.
async function moveToWave(step: Step, release: ReleaseRow, next: number): Promise<void> {
  const { deps } = step;
  const now = deps.clock().getTime();
  if (release.nextWaveAt === null && deps.pauseMs > 0) {
    const due = new Date(now + deps.pauseMs);
    if (await setRelease(deps.db, release.id, ['waves'], { nextWaveAt: due })) step.schedule(due);
    return;
  }
  if (release.nextWaveAt !== null && release.nextWaveAt.getTime() > now) return step.schedule(release.nextWaveAt);
  if (!(await bumpWave(deps.db, release, next))) return;
  deps.log('release-wave', { release: release.id, wave: next });
  const moved = await readRelease(deps.db, release.id);
  if (moved !== null) await advanceRelease(step, moved);
}

// Волна 0 (тестовый магазин) прошла: тема ждёт «да» человека (П10-2 В); платформа и расширение идут дальше сами.
async function finishTesting(step: Step, release: ReleaseRow, next: number | null): Promise<void> {
  const { deps } = step;
  if (KINDS[release.kind].approval) {
    if (await setRelease(deps.db, release.id, ['testing'], { status: 'awaiting' }))
      deps.log('release-awaiting', { release: release.id, to: release.toVersion });
    return;
  }
  if (next === null) return finishRelease(step, release);
  if (await setRelease(deps.db, release.id, ['testing'], { status: 'waves' }))
    await moveToWave(step, { ...release, status: 'waves' }, next);
}

async function finishWave(step: Step, release: ReleaseRow): Promise<void> {
  const next = await nextWaveOf(step.deps.db, release);
  if (release.status === 'testing') return finishTesting(step, release, next);
  if (next === null) return finishRelease(step, release);
  await moveToWave(step, release, next);
}

// Выпуск, ждавший другого (queued), встаёт, когда на контуре нет активного. Чужой (П10-7 А) не трогаем.
async function startQueued(step: Step): Promise<void> {
  const { db, contour } = step.deps;
  if ((await activeReleases(db, contour)).length > 0) return;
  const [queued] = await queuedReleases(db, contour);
  if (queued === undefined || isForeign(step.deps, queued)) return;
  if (await setRelease(db, queued.id, ['queued'], { status: 'testing' }))
    await advanceRelease(step, { ...queued, status: 'testing' });
}

async function advanceAll(step: Step): Promise<void> {
  await startQueued(step);
  for (const release of await ownReleases(step.deps)) await advanceRelease(step, release);
}

// Вернуть магазин (П10-4 А): тема — закрепление на прежнее и указатель на сборку до выпуска без паузы; платформа и
// расширение — указатель с паузой (их код не закрепить). Вернёт текст для тревоги, если указатель не вернулся.
export async function revertShop(deps: ShopDeps, release: ReleaseRow, shop: ReleaseShopRow): Promise<string | null> {
  const rules = KINDS[release.kind];
  if (rules.pin) await pinVersion(deps, release, shop.siteId, shop.versionBefore, 'revert');
  const target = await targetOf(deps, release, shop.siteId);
  const live = target.pointer?.build ?? null;
  if (live === null || shop.buildBefore === null || live === shop.buildBefore) return null;
  const intent = { kind: 'revert' as const, from: live, to: shop.buildBefore, pause: rules.pauseOnRevert };
  try {
    await changePointer(deps.store, target.label, intent);
    return null;
  } catch (error) {
    return `указатель не вернулся: ${errorText(error)}`;
  }
}

// Остановка: вернуть магазин, тревога, выпуск stopped. Откат и тревога — до записи stopped: упади процесс посередине,
// resume доделает остановку по строке broken (повтор отката ничего не меняет, тревога может прийти дважды).
async function stopOn(step: Step, release: ReleaseRow, shop: ReleaseShopRow, reason: string): Promise<void> {
  const { deps } = step;
  const problem = await revertShop(deps, release, shop).catch(
    (error: unknown) => `откат не прошёл: ${errorText(error)}`,
  );
  await raiseReleaseStopped(deps, release, shop.siteId, problem === null ? reason : `${reason}; ${problem}`);
  await setRelease(deps.db, release.id, ACTIVE_STATUSES, {
    status: 'stopped',
    stopReason: `${shop.siteId}: ${reason}`,
  });
}

async function broken(step: Step, release: ReleaseRow, shop: ReleaseShopRow, reason: string, patch: ShopPatch = {}) {
  const marked = await setShop(step.deps.db, keyOf(shop), ['building', 'checking'], {
    ...patch,
    status: 'broken',
    error: reason,
  });
  if (marked) await stopOn(step, release, { ...shop, status: 'broken' }, reason);
}

// Закрепление (тема) и событие выпуска: сборка встанет в очередь с приоритетом «выпуск». Повтор безвреден: закрепление на
// ту же версию ничего не пишет, лишнее событие склеит строка магазина (блок 6).
async function startBuild(step: Step, release: ReleaseRow, shop: ReleaseShopRow): Promise<void> {
  const { deps } = step;
  const rules = KINDS[release.kind];
  if (rules.pin) await pinVersion(deps, release, shop.siteId, release.toVersion, 'release');
  // Выпуск нашей секции (часть 15з, Р15з-5): на витрину — только её правка, до события сборки; повтор шага — already.
  if (release.kind === 'section') {
    const published = await publishSection(deps.db, shop.siteId, release.subject, release.toVersion);
    if (published === 'changed') return leaveWave(step, release, shop, SKIP.sectionChanged);
  }
  await deps.publishEvent(event(deps, rules.event, shop.siteId));
  deps.log('release-shop-building', { release: release.id, shopId: shop.siteId, wave: shop.wave });
}

// Живая сборка на новой версии → страницы без браузера → задание «после». Не на новой (склеенная или старая сборка) —
// ждём следующей сборки: строка release-shop-not-reached. Обе проверки ждут, пока раздача станет новой сборкой:
// указатель кэшируется ~1 с, паспорт со старого HTML ловит 404 бандлов старой таблицы раздачи (№77, 26.10).
async function checkReached(step: Step, release: ReleaseRow, shop: ReleaseShopRow): Promise<void> {
  const { deps } = step;
  const target = await targetOf(deps, release, shop.siteId);
  if (target.skip !== null) return leaveWave(step, release, shop, target.skip);
  const manifest = await liveManifest(deps.store, target.label);
  const live = manifest?.theme.version ?? null;
  if (manifest === null || !KINDS[release.kind].reached(manifest, release))
    return deps.log('release-shop-not-reached', { release: release.id, shopId: shop.siteId, live });
  const homeHash = manifest.pages.find((page) => page.path === '/')?.hash ?? null;
  const home = homeHash === null ? null : hexOf(homeHash);
  const pages = await deps.pageCheck(target.url, { version: KINDS[release.kind].expectedVersion(release), home });
  if (!pages.ok) return broken(step, release, shop, `страницы: ${pages.problems.join('; ')}`);
  const patch = { status: 'checking' as const, buildAfter: target.pointer?.build ?? null };
  if (await setShop(deps.db, keyOf(shop), ['building'], patch))
    await deps.publishCheck(afterJob(release, shop, target.url, home));
}

// Упала сборка: поломка версии — стоп; сбой данных — магазин ждёт повторов блока 6, волна ждёт магазин.
function onFailed(step: Step, release: ReleaseRow, shop: ReleaseShopRow, build: FinishedBuild): Promise<void> {
  if (isBreakage(build.code ?? 'unknown')) return broken(step, release, shop, `сборка упала: ${build.error ?? ''}`);
  step.deps.log('release-shop-waits', { release: release.id, shopId: shop.siteId, error: build.error });
  return Promise.resolve();
}

type OnBuild = (step: Step, release: ReleaseRow, shop: ReleaseShopRow, build: FinishedBuild) => Promise<void>;

// Ключ совпал с живой сборкой (skipped) или файлы те же (unchanged). Тема и расширение меняют входы — значит, живая
// сборка уже на новой версии, её проверит checkReached. Платформа входов может не менять: живая сборка не на новом
// коде — магазин уходит из волны пропуском (задача 11).
async function sameBuild(step: Step, release: ReleaseRow, shop: ReleaseShopRow): Promise<void> {
  const rules = KINDS[release.kind];
  if (!rules.leaveUnchanged) return checkReached(step, release, shop);
  const target = await targetOf(step.deps, release, shop.siteId);
  const manifest = target.skip === null ? await liveManifest(step.deps.store, target.label) : null;
  if (manifest !== null && rules.reached(manifest, release)) return checkReached(step, release, shop);
  return leaveWave(step, release, shop, SKIP.unchanged);
}

const ON_BUILD: Record<BuildOutcome, OnBuild> = {
  live: checkReached,
  skipped: sameBuild,
  unchanged: sameBuild,
  stale: checkReached,
  paused: (step, release, shop) => leaveWave(step, release, shop, SKIP.paused),
  failed: onFailed,
  // Сборку не дождалась штатная остановка сборщика (блок 6): задание переставлено под новым номером, магазин ждёт её.
  interrupted: () => Promise.resolve(),
};

async function afterBuild(step: Step, build: FinishedBuild): Promise<void> {
  const shop = await activeShopOf(step.deps.db, build.siteId, ['building']);
  const release = shop === null ? null : await readRelease(step.deps.db, shop.releaseId);
  if (shop === null || release === null || isForeign(step.deps, release)) return;
  await ON_BUILD[build.outcome](step, release, shop, build);
}

// Паспорт «до» снят: прежние сборка и закрепление — в строку магазина, потом закрепление и событие. Страница не
// открылась — пропуск: до выпуска она уже была плоха, версия тут ни при чём.
async function onBefore(step: Step, release: ReleaseRow, shop: ReleaseShopRow, result: CheckResult): Promise<void> {
  const { deps } = step;
  if (result.error !== null)
    return leaveWave(step, release, shop, `страница до обновления не открылась: ${result.error}`);
  const target = await targetOf(deps, release, shop.siteId);
  if (target.skip !== null) return leaveWave(step, release, shop, target.skip);
  const patch = {
    status: 'building' as const,
    passportBefore: result.passport,
    buildBefore: target.pointer?.build ?? null,
    versionBefore: await pinnedVersion(deps.db, shop.siteId),
  };
  if (await setShop(deps.db, keyOf(shop), ['before'], patch)) await startBuild(step, release, { ...shop, ...patch });
}

// Паспорт «после»: не снят или красный — поломка; иначе done (жёлтый — тоже done, отличия — в отчёте задачи 10).
async function onAfter(step: Step, release: ReleaseRow, shop: ReleaseShopRow, result: CheckResult): Promise<void> {
  const patch = { passportAfter: result.passport, verdict: result.verdict };
  if (result.error !== null) return broken(step, release, shop, `паспорт после обновления не снят: ${result.error}`);
  const red = `паспорт после обновления красный: отличий ${result.differences.length}`;
  if (result.verdict === 'red') return broken(step, release, shop, red, patch);
  if (!(await setShop(step.deps.db, keyOf(shop), ['checking'], { ...patch, status: 'done' }))) return;
  step.deps.log('release-shop-done', { release: release.id, shopId: shop.siteId, verdict: result.verdict });
  await advanceRelease(step, release);
}

const PHASE_STATUS = { before: 'before', after: 'checking' } as const;
const ON_RESULT = { before: onBefore, after: onAfter } as const;

// Ответ проверки — магазину, который его ждёт. Опоздавший ответ (выпуск стоит, магазин уже дальше) отбрасывается.
async function onCheckResult(step: Step, result: CheckResult): Promise<void> {
  const shop = await activeShopOf(step.deps.db, result.siteId, [PHASE_STATUS[result.phase]]);
  const release = shop?.releaseId === result.release ? await readRelease(step.deps.db, result.release) : null;
  if (shop === null || release === null) return;
  await ON_RESULT[result.phase](step, release, shop, result);
}

type Resend = (step: Step, release: ReleaseRow, shop: ReleaseShopRow, target: Target) => Promise<void>;

// Что отправить ещё раз магазину в работе: задание проверки или событие сборки.
const RESEND: Partial<Record<ShopStatus, Resend>> = {
  before: (step, release, shop, target) =>
    step.deps.publishCheck({ v: 1, release: release.id, siteId: shop.siteId, phase: 'before', url: target.url }),
  building: (step, release, shop) => startBuild(step, release, shop),
  checking: async (step, release, shop, target) =>
    step.deps.publishCheck(afterJob(release, shop, target.url, await homeHexAwaited(step, target))),
};

// Ожидание новой сборки для повторного задания «после»: манифест живой сборки знает отпечаток файла главной.
function homeHexAwaited(step: Step, target: Target): Promise<string | null> {
  return target.pointer === null ? Promise.resolve(null) : homeHexOf(step.deps.store, target.label);
}

async function resumeShop(step: Step, release: ReleaseRow, shop: ReleaseShopRow): Promise<void> {
  if (shop.status === 'broken') return stopOn(step, release, shop, shop.error ?? 'магазин сломан');
  const resend = RESEND[shop.status];
  if (resend === undefined) return;
  const target = await targetOf(step.deps, release, shop.siteId);
  if (target.skip !== null) return skipShop(step, release, shop, target.skip);
  await resend(step, release, shop, target);
}

// Перезапуск сборщика или сбой шага: задания, которые могли потеряться, — ещё раз (лишний ответ отбросит условный
// переход), остановку по строке broken — доделать, таймер выдержки — заново. Чужие выпуски (П10-7 А) — не наши.
async function resume(step: Step): Promise<void> {
  const { deps } = step;
  for (const release of await ownReleases(deps)) {
    if (release.nextWaveAt !== null) step.schedule(release.nextWaveAt);
    for (const shop of await waveShops(deps.db, release.id, release.wave)) await resumeShop(step, release, shop);
  }
  await advanceAll(step);
}

// Шаги — по одному: событие, ответ проверки и таймеры не перемешиваются. run отдаёт ошибку шага тому, кто звал;
// quiet — нет. Упавший шаг — строка журнала и onFailure. close — штатная остановка: новых шагов нет (ответ проверки
// брокер вернёт в очередь — его возьмёт следующий запуск), идущий шаг дожидаемся, но не дольше limitMs.
function stepQueue(log: Log, onFailure: () => void) {
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  const run = (work: () => Promise<void>): Promise<void> => {
    if (closed) return Promise.reject(new Error(STOPPED));
    const next = chain.then(work);
    chain = next.catch((error: unknown) => {
      log('release-step-failed', { error: errorText(error) });
      onFailure();
    });
    return next;
  };
  const quiet = (work: () => Promise<void>): Promise<void> => run(work).catch(() => undefined);
  const close = async (limitMs: number): Promise<void> => {
    closed = true;
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, limitMs)));
    await Promise.race([chain, limit]);
    clearTimeout(timer);
  };
  return { run, quiet, close };
}

// Таймеры ведущего — выдержка между волнами и сверка после сбоя; stop снимает все.
function timerSet() {
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;
  const later = (ms: number, work: () => void): void => {
    if (stopped) return;
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        work();
      },
      Math.max(0, ms),
    );
    timers.add(timer);
  };
  const stop = (): void => {
    stopped = true;
    timers.forEach((timer) => clearTimeout(timer));
  };
  return { later, stop };
}

export function createConductor(deps: ConductorDeps): Conductor {
  const timers = timerSet();
  let resumeDue = false;
  // Шаг упал — сверка выпусков через RESUME_AFTER_FAILURE_MS, одна на все упавшие шаги: таймер только на сбое.
  const resumeLater = (): void => {
    if (resumeDue) return;
    resumeDue = true;
    timers.later(RESUME_AFTER_FAILURE_MS, () => {
      resumeDue = false;
      void steps.quiet(() => resume(step));
    });
  };
  const steps = stepQueue(deps.log, resumeLater);
  const schedule = (due: Date): void =>
    timers.later(due.getTime() - deps.clock().getTime(), () => void steps.quiet(() => advanceAll(step)));
  const step: Step = { deps, schedule };
  return {
    advance: () => steps.quiet(() => advanceAll(step)),
    resume: () => steps.quiet(() => resume(step)),
    afterBuild: (build) => steps.quiet(() => afterBuild(step, build)),
    // Ответ проверки: шаг упал или выпуск чужой — ошибка уходит брокеру, он вернёт ответ в очередь через секунду
    // (broker.ts, deliver).
    onCheckResult: async (result) => {
      await refuseForeign(deps, result);
      await steps.run(() => onCheckResult(step, result));
    },
    stop: timers.stop,
    shutdown: async (limitMs) => {
      timers.stop();
      await steps.close(limitMs);
    },
  };
}
