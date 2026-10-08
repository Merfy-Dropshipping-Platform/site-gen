import { buildKey, buildStorefront, parseBuildInputs, type ThemeBuild } from '@merfy/storefront-build';
import { publishBuild, type ObjectStore } from '@merfy/storefront-storage';
import { StorefrontBuilderError, errorText } from './errors';
import type { Announce } from './indexnow';
import { liveManifest } from './live';
import type { Log } from './log';
import {
  claimJob,
  finishFailure,
  finishSuccess,
  type ClaimedJob,
  type Finished,
  type Queryable,
  type ShopStateOptions,
  type StartedJob,
} from './shop-state';
import { readSnapshot, type Snapshot, type SnapshotDeps } from './snapshot';
import { recordBuild, type BuildOutcome, type Steps } from './build-record';
import type { BuildJob } from './events';
import type { StoppedShop } from './alert';

// Одно задание сборки (design.md блока 6): взять замок → снимок данных → ключ совпал с живой — не собираем → сборка
// блока 4 → выкладка блока 5 → конец: строка сборки, «ещё раз» или повтор, тревога. Время каждого шага — в журнал и в
// строку сборки (В6-5 Б). Упала любая ступень — живой сайт не тронут: указатель пишет только выкладка.

export interface LoadedTheme {
  version: string;
  contentHash: string;
  build: ThemeBuild;
}

export interface BuilderDeps {
  db: Queryable;
  store: ObjectStore;
  snapshot: SnapshotDeps;
  themes: ReadonlyMap<string, LoadedTheme>;
  platformCommit: string;
  indexable: boolean;
  shopState: ShopStateOptions;
  clock: () => Date;
  log: Log;
  enqueue: (job: StartedJob) => Promise<void>;
  alert: (stopped: StoppedShop) => Promise<void>;
  // После переключения указателя у магазина для поиска — IndexNow (design.md, раздел 4).
  announce?: Announce;
}

interface Attempt {
  outcome: BuildOutcome;
  error: string | null;
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

function themeFor(deps: BuilderDeps, snapshot: Snapshot): ThemeBuild {
  const theme = deps.themes.get(snapshot.inputs.theme.id);
  if (theme !== undefined) return theme.build;
  throw new StorefrontBuilderError('renderer-missing', 'у темы нет рисовальщика', { path: snapshot.inputs.theme.id });
}

async function publish(deps: BuilderDeps, job: ClaimedJob, snapshot: Snapshot, theme: ThemeBuild) {
  const references = { platformCommit: deps.platformCommit };
  const build = await buildStorefront(snapshot.inputs, references, theme);
  const request = { label: snapshot.address.label, build: job.build, manifest: build.manifest, files: build.files };
  const now = deps.clock().toISOString();
  const options = { ...request, publicUrl: snapshot.address.url, indexable: deps.indexable, now };
  return { ...(await publishBuild(deps.store, options)), pages: build.manifest.pages };
}

async function attempt(deps: BuilderDeps, job: ClaimedJob, steps: Steps): Promise<Attempt> {
  const time = stepTimer(deps, job, steps);
  const snapshot = await time('snapshot', () => readSnapshot(deps.snapshot, job.siteId));
  const key = buildKey(parseBuildInputs(snapshot.inputs));
  const live = await time('compare', () => liveManifest(deps.store, snapshot.address.label));
  if (live?.key === key) return { outcome: 'skipped', error: null };
  const theme = themeFor(deps, snapshot);
  const result = await time('build', () => publish(deps, job, snapshot, theme));
  if (result.status === 'live' && deps.indexable)
    await deps.announce?.(snapshot.address.url, live?.pages ?? [], result.pages);
  if (result.status !== 'blocked') return { outcome: result.status, error: null };
  const problems = result.problems.map((problem) => `${problem.rule}: ${problem.text}`).join('; ');
  throw new StorefrontBuilderError('build-blocked', problems, { path: `site/${job.siteId}` });
}

async function attemptSafely(deps: BuilderDeps, job: ClaimedJob, steps: Steps): Promise<Attempt> {
  try {
    return await attempt(deps, job, steps);
  } catch (error) {
    return { outcome: 'failed', error: errorText(error) };
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
}

export async function runBuildJob(deps: BuilderDeps, job: BuildJob): Promise<void> {
  const claimed = await claimJob(deps.db, { ...job, priority: 0 }, deps.shopState.leaseMs);
  if (claimed === null) return deps.log('job-skipped', { shopId: job.siteId, buildId: job.build });
  deps.log('build-start', { shopId: claimed.siteId, buildId: claimed.build, events: claimed.events });
  const steps: Steps = {};
  const result = await attemptSafely(deps, claimed, steps);
  const finishedAt = deps.clock();
  await recordBuild(deps.db, { job: claimed, ...result, steps, finishedAt });
  const total = finishedAt.getTime() - claimed.startedAt.getTime();
  deps.log('build-finish', { shopId: claimed.siteId, buildId: claimed.build, ...result, ms: total });
  await settle(deps, claimed, result.error);
}
