import {
  StorefrontBuildError,
  buildKey,
  buildStorefront,
  parseBuildInputs,
  type Changelog,
  type CodeNoticed,
  type SectionFailure,
  type ThemeBuild,
} from '@merfy/storefront-build';
import { withSectionRenderer } from '@merfy/storefront-sections';
import { publishBuild, type ObjectStore } from '@merfy/storefront-storage';
import { StorefrontBuilderError, errorText } from './errors';
import { shouldAnnounce, type Announce } from './indexnow';
import { liveManifest } from './live';
import type { Log } from './log';
import { queueHeldReleases } from './release';
import { foreignPlatformRelease } from './release/store';
import {
  claimJob,
  finishFailure,
  finishSuccess,
  type ClaimedJob,
  type Database,
  type Finished,
  type ShopStateOptions,
  type StartedJob,
} from './shop-state';
import { recordRenderErrors } from './section-error-store';
import { minuteOf } from './section-errors';
import { readSnapshot, type Snapshot, type SnapshotDeps } from './snapshot';
import { pinShop, type ThemeCatalog } from './theme-catalog';
import { recordBuild, type BuildOutcome, type Steps } from './build-record';
import type { BuildJob } from './events';
import type { StoppedShop } from './alert';
import type { FinishedBuild } from './release/conductor';

// Одно задание сборки (design.md блока 6): взять замок → снимок данных → ключ совпал с живой — не собираем → сборка
// блока 4 → выкладка блока 5 → конец: строка сборки, «ещё раз» или повтор, тревога. Время каждого шага — в журнал и в
// строку сборки (В6-5 Б). Упала любая ступень — живой сайт не тронут: указатель пишет только выкладка.

export interface LoadedTheme {
  version: string;
  contentHash: string;
  build: ThemeBuild;
}

export interface BuilderDeps {
  db: Database;
  store: ObjectStore;
  snapshot: SnapshotDeps;
  themes: ReadonlyMap<string, LoadedTheme>;
  // Рисовальщик версии из закрепления магазина (блок 10): образ или архив прошлой версии.
  catalog: Pick<ThemeCatalog, 'themeAt'>;
  platformCommit: string;
  indexable: boolean;
  shopState: ShopStateOptions;
  // Предел выпуска K (В6-2 В, release.ts): конец сборки освобождает место — его берёт самый давний ждущий выпуск.
  releaseSlots: number;
  clock: () => Date;
  log: Log;
  enqueue: (job: StartedJob) => Promise<void>;
  alert: (stopped: StoppedShop) => Promise<void>;
  // После переключения указателя у магазина для поиска — IndexNow (design.md, раздел 4).
  announce?: Announce;
  // Идущие сборки: их отмечает «прервана» штатная остановка, если не дождалась (runtime.ts, shutdown).
  running?: Set<RunningBuild>;
  // Конец сборки — ведущему волн (блок 10): дошёл ли магазин выпуска до версии.
  afterBuild?: (build: FinishedBuild) => Promise<void>;
  // Журналы версий тем образа: IndexNow при смене версии — только с пометкой «поисковикам» (блок 10).
  changelogs?: ReadonlyMap<string, Changelog>;
}

export interface RunningBuild {
  job: ClaimedJob;
  steps: Steps;
}

interface Attempt {
  outcome: BuildOutcome;
  error: string | null;
  // Код ошибки для ведущего волн (блок 10): поломка версии или сбой данных; null — сборка не упала.
  code: string | null;
}

// Секундомер шагов: каждый шаг — строка журнала { buildId, shopId, step, ms, queueWaitMs } и поле в строке сборки.
function stepTimer(deps: BuilderDeps, job: ClaimedJob, steps: Steps) {
  const queueWaitMs = job.startedAt.getTime() - job.queuedAt.getTime();
  steps.queue = queueWaitMs;
  return async <T>(step: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = deps.clock().getTime();
    const result = await work();
    steps[step] = deps.clock().getTime() - startedAt;
    deps.log('step', { buildId: job.build, shopId: job.siteId, step, ms: steps[step], queueWaitMs });
    return result;
  };
}

async function themeFor(deps: BuilderDeps, snapshot: Snapshot): Promise<ThemeBuild> {
  if (!deps.themes.has(snapshot.inputs.theme.id))
    throw new StorefrontBuilderError('renderer-missing', 'у темы нет рисовальщика', { path: snapshot.inputs.theme.id });
  return (await deps.catalog.themeAt(snapshot.inputs.theme.id, snapshot.inputs.theme.version)).build;
}

// Пустое закрепление — выпущенной версией, до снимка (блок 10).
const pin = (deps: BuilderDeps, siteId: string): Promise<void> =>
  pinShop({ db: deps.db, pins: deps.snapshot.pins, themeIds: [...deps.themes.keys()], log: deps.log }, siteId);

// Упавшие секции сборки (блок 2 «Секций и SDK», «Решил сам» п. 7): строка журнала section-render-failed сразу, строки
// таблицы ошибок — после сборки, даже если она упала. База не ответила — строка журнала, сборка идёт своим ходом.
function failureLog(deps: BuilderDeps, job: ClaimedJob, failures: SectionFailure[]) {
  return (failure: SectionFailure): void => {
    failures.push(failure);
    deps.log('section-render-failed', {
      shopId: job.siteId,
      buildId: job.build,
      section: failure.section,
      sectionId: failure.id,
      stage: failure.stage,
      error: failure.message,
    });
  };
}

// Предупреждения бандла страницы (блок 5 «Секций и SDK», часть 5б): section-script-skipped, page-script-heavy — строкой
// журнала; сборка идёт дальше.
function codeNotice(deps: BuilderDeps, job: ClaimedJob): CodeNoticed {
  return (page, notice) =>
    deps.log(notice.code, {
      shopId: job.siteId,
      buildId: job.build,
      page,
      section: notice.section,
      bytes: notice.bytes,
      error: notice.message,
    });
}

async function recordFailures(deps: BuilderDeps, job: ClaimedJob, failures: SectionFailure[]): Promise<void> {
  const batch = { shopId: job.siteId, minute: minuteOf(deps.clock().toISOString()), failures };
  await recordRenderErrors(deps.db, batch).catch((error: unknown) =>
    deps.log('section-render-errors-failed', { shopId: job.siteId, buildId: job.build, error: errorText(error) }),
  );
}

async function buildWithSections(deps: BuilderDeps, job: ClaimedJob, snapshot: Snapshot, theme: ThemeBuild) {
  // Справки сборки: коммит образа и включённые расширения магазина (блок 10, задача 11) — в манифест, не в ключ.
  const references = { platformCommit: deps.platformCommit, extensions: snapshot.extensions };
  const failures: SectionFailure[] = [];
  // Секции рисует процесс рендера (storefront-sections): он запускается при первой секции и закрывается после сборки.
  try {
    return await withSectionRenderer((render) =>
      buildStorefront(
        snapshot.inputs,
        references,
        theme,
        snapshot.assets,
        render,
        failureLog(deps, job, failures),
        codeNotice(deps, job),
      ),
    );
  } finally {
    await recordFailures(deps, job, failures);
  }
}

async function publish(deps: BuilderDeps, job: ClaimedJob, snapshot: Snapshot, theme: ThemeBuild) {
  const build = await buildWithSections(deps, job, snapshot, theme);
  const request = { label: snapshot.address.label, build: job.build, manifest: build.manifest, files: build.files };
  const now = deps.clock().toISOString();
  const options = { ...request, publicUrl: snapshot.address.url, indexable: deps.indexable, now };
  return { ...(await publishBuild(deps.store, options)), pages: build.manifest.pages };
}

async function attempt(deps: BuilderDeps, job: ClaimedJob, steps: Steps): Promise<Attempt> {
  const time = stepTimer(deps, job, steps);
  await pin(deps, job.siteId);
  const snapshot = await time('snapshot', () => readSnapshot(deps.snapshot, job.siteId));
  const key = buildKey(parseBuildInputs(snapshot.inputs));
  const live = await time('compare', () => liveManifest(deps.store, snapshot.address.label));
  if (live?.key === key) return { outcome: 'skipped', error: null, code: null };
  const theme = await themeFor(deps, snapshot);
  const result = await time('build', () => publish(deps, job, snapshot, theme));
  if (result.status === 'live' && deps.indexable && shouldAnnounce(deps.changelogs, live, snapshot.inputs))
    await deps.announce?.(snapshot.address.url, live?.pages ?? [], result.pages);
  if (result.status !== 'blocked') return { outcome: result.status, error: null, code: null };
  const problems = result.problems.map((problem) => `${problem.rule}: ${problem.text}`).join('; ');
  throw new StorefrontBuilderError('build-blocked', problems, { path: `site/${job.siteId}` });
}

// Код ошибки для ведущего волн (блок 10): поломка версии или сбой данных. Ошибка без кода — 'unknown'.
const codeOf = (error: unknown): string =>
  error instanceof StorefrontBuilderError || error instanceof StorefrontBuildError ? error.code : 'unknown';

async function attemptSafely(deps: BuilderDeps, job: ClaimedJob, steps: Steps): Promise<Attempt> {
  try {
    return await attempt(deps, job, steps);
  } catch (error) {
    return { outcome: 'failed', error: errorText(error), code: codeOf(error) };
  }
}

type After = (deps: BuilderDeps, job: StartedJob, next: Finished, error: string) => Promise<void>;

// Что делать после конца сборки — по новому состоянию строки магазина.
const AFTER: { [S in Finished['state']]: After } = {
  idle: () => Promise.resolve(),
  busy: (deps, job, next) => (next.state === 'busy' ? deps.enqueue(next) : Promise.resolve()),
  retrying: (deps, job) => Promise.resolve(deps.log('build-retry', { shopId: job.siteId, buildId: job.build })),
  stopped: (deps, job, next, error) =>
    deps.alert({ job, attempts: next.state === 'stopped' ? next.attempt : 0, error }),
};

// Конец сборки: строка магазина и следующий шаг. null — строку уже поменяли (замок истёк, задание переставлено).
export async function settle(deps: BuilderDeps, job: StartedJob, error: string | null): Promise<void> {
  const next =
    error === null
      ? await finishSuccess(deps.db, job, deps.shopState)
      : await finishFailure(deps.db, job, error, deps.shopState);
  if (next === null) return deps.log('build-lost', { shopId: job.siteId, buildId: job.build });
  await AFTER[next.state](deps, job, next, error ?? '');
  await queueHeldReleases(deps);
}

// Магазин ждёт сборки выпуска платформы с другим кодом (П10-7 А). Coolify выкатывает сборщик «rolling»: секунды
// работают старый и новый образ, и старый своим кодом получил бы skipped вместо сборки на новом. Задание не берём —
// строго до claimJob: взятое задание по тому же номеру уже никто не возьмёт. Ошибка release-foreign — не «негодное»
// сообщение: брокер вернёт его в очередь через REQUEUE_DELAY_MS (broker.ts, deliver), его возьмёт сборщик того кода.
// Край: новый сборщик завёл выпуск и умер, старый жив (Coolify откатил выкатку). Тогда задания магазинов выпуска в
// building — не больше RELEASE_SLOTS — ходят по кругу раз в REQUEUE_DELAY_MS, по две строки журнала на круг, и эти
// магазины не собираются, пока следующий старт сборщика не остановит выпуск («вышел новый образ сборщика»,
// platform.ts) или не поведёт его сам (тот же код). Шум ограничен числом мест выпуска; бесконечного цикла без задержки нет.
async function refuseForeign(deps: BuilderDeps, job: BuildJob): Promise<void> {
  const release = await foreignPlatformRelease(deps.db, job.siteId, deps.snapshot.platform.renderHash);
  if (release === null) return;
  deps.log('release-foreign-build', { shopId: job.siteId, buildId: job.build, release });
  const text = `сборку выпуска платформы ${release} делает сборщик с его кодом`;
  throw new StorefrontBuilderError('release-foreign', text, { path: `site/${job.siteId}` });
}

export async function runBuildJob(deps: BuilderDeps, job: BuildJob): Promise<void> {
  await refuseForeign(deps, job);
  const claimed = await claimJob(deps.db, { ...job, priority: 0 }, deps.shopState.leaseMs);
  if (claimed === null) return deps.log('job-skipped', { shopId: job.siteId, buildId: job.build });
  deps.log('build-start', { shopId: claimed.siteId, buildId: claimed.build, events: claimed.events });
  const running: RunningBuild = { job: claimed, steps: {} };
  deps.running?.add(running);
  try {
    const { steps } = running;
    const result = await attemptSafely(deps, claimed, steps);
    const finishedAt = deps.clock();
    await recordBuild(deps.db, { job: claimed, ...result, steps, finishedAt });
    const total = finishedAt.getTime() - claimed.startedAt.getTime();
    deps.log('build-finish', { shopId: claimed.siteId, buildId: claimed.build, ...result, ms: total });
    await settle(deps, claimed, result.error);
    await deps.afterBuild?.({ siteId: claimed.siteId, build: claimed.build, ...result });
  } finally {
    deps.running?.delete(running);
  }
}
