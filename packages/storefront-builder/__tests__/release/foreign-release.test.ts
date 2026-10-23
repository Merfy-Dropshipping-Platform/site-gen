import type { ObjectStore } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { runBuildJob, type BuilderDeps } from '../../src/build-job';
import type { CheckResult } from '../../src/release/checks';
import { createConductor, type ConductorDeps } from '../../src/release/conductor';

// Выпуск платформы ведёт и собирает только сборщик с его кодом (П10-7 А). База — подделка: ответ по тексту запроса,
// все запросы — в журнал теста. «Записи» — UPDATE, INSERT и NOTIFY: у чужого выпуска их быть не должно.
const OWN = `sha256:${'b'.repeat(64)}`;
const OTHER = `sha256:${'e'.repeat(64)}`;
const SHOP = 'shop-1';
type Row = Record<string, unknown>;

interface FakeState {
  releases: Row[];
  queued: Row[];
  shops: Row[];
  foreign: Row[];
  sql: string[];
}

const releaseRow = (toHash: string, status = 'testing'): Row => ({
  id: 7,
  kind: 'platform',
  subject: 'platform',
  from_version: 'a'.repeat(40),
  to_version: 'b'.repeat(40),
  to_hash: toHash,
  contour: 'dev',
  started_by: 'builder',
  status,
  wave: 0,
  next_wave_at: null,
  stop_reason: null,
  report: {},
});

const shopRow = (status: string): Row => ({
  release_id: 7,
  site_id: SHOP,
  wave: 0,
  position: 0,
  status,
  build_before: null,
  build_after: null,
  version_before: null,
  passport_before: null,
  passport_after: null,
  verdict: null,
  error: null,
});

// Порядок важен: запрос «чужой сборки» тоже соединяет строки магазина с выпуском. Ждущий выпуск отдаётся один раз —
// после старта он уже не в очереди.
const ROUTES: readonly [string, (state: FakeState) => Row[]][] = [
  ["r.kind = 'platform'", (state) => state.foreign],
  ["status = 'queued'", (state) => state.queued.splice(0)],
  ['FROM storefront_release WHERE', (state) => state.releases],
  ['JOIN storefront_release r', (state) => state.shops],
  ['FROM storefront_release_shop s WHERE', (state) => state.shops],
  ['min(wave)', () => [{ wave: null }]],
];

function fakeDb(state: FakeState) {
  const query = (text: string) => {
    state.sql.push(text);
    const route = ROUTES.find(([part]) => text.includes(part));
    const rows = route === undefined ? [] : route[1](state);
    return Promise.resolve({ rows, rowCount: route === undefined ? 1 : rows.length });
  };
  return Object.assign(new Pool(), { query });
}

const writes = (state: FakeState): string[] =>
  state.sql.filter((text) => /^\s*(UPDATE|INSERT|WITH)/.test(text) || text.includes('pg_notify'));

const state = (patch: Partial<FakeState> = {}): FakeState => ({
  releases: [],
  queued: [],
  shops: [],
  foreign: [],
  sql: [],
  ...patch,
});

const refused = new Error('хранилище в этом тесте не нужно');
const store: ObjectStore = {
  read: () => Promise.reject(refused),
  has: () => Promise.reject(refused),
  write: () => Promise.reject(refused),
  list: () => Promise.reject(refused),
  remove: () => Promise.reject(refused),
};

function conductorOf(fake: FakeState) {
  const lines: string[] = [];
  const deps: ConductorDeps = {
    db: fakeDb(fake),
    store,
    contour: 'dev',
    window: 1,
    pauseMs: 0,
    clock: () => new Date('2026-10-12T10:00:00Z'),
    log: (message) => void lines.push(message),
    publishEvent: vi.fn(() => Promise.resolve()),
    publishCheck: vi.fn(() => Promise.resolve()),
    publishActivity: vi.fn(() => Promise.resolve()),
    pageCheck: () => Promise.reject(refused),
    themeIds: ['nova'],
    testShop: null,
    enabledExtensions: () => Promise.resolve([]),
    renderHash: OWN,
  };
  return { conductor: createConductor(deps), deps, lines };
}

const beforeResult: CheckResult = {
  v: 1,
  release: 7,
  siteId: SHOP,
  phase: 'before',
  passport: null,
  verdict: null,
  differences: [],
  error: 'страница не открылась',
};

describe('ведущий волн и чужой выпуск платформы (П10-7 А)', () => {
  it('advance: чужой выпуск — ни проверки, ни записей; свой — шаги как раньше', async () => {
    const foreign = state({ releases: [releaseRow(OTHER)], shops: [shopRow('waiting')] });
    const other = conductorOf(foreign);
    await other.conductor.advance();
    expect(other.deps.publishCheck).not.toHaveBeenCalled();
    expect(writes(foreign)).toEqual([]);
    const own = state({ releases: [releaseRow(OWN)] });
    const mine = conductorOf(own);
    await mine.conductor.advance();
    expect(mine.lines).toContain('release-finished');
    expect(writes(own).some((text) => text.includes('pg_notify'))).toBe(true);
  });

  it('advance: чужой выпуск в очереди не встаёт, свой — встаёт', async () => {
    const foreign = state({ queued: [releaseRow(OTHER, 'queued')] });
    await conductorOf(foreign).conductor.advance();
    expect(writes(foreign)).toEqual([]);
    const own = state({ queued: [releaseRow(OWN, 'queued')] });
    await conductorOf(own).conductor.advance();
    expect(writes(own).some((text) => text.includes('UPDATE storefront_release SET status'))).toBe(true);
  });

  it('resume: чужой выпуск — ни событий, ни записей; свой — магазин без сайта уходит пропуском', async () => {
    const foreign = state({ releases: [releaseRow(OTHER)], shops: [shopRow('building')] });
    const other = conductorOf(foreign);
    await other.conductor.resume();
    expect(other.deps.publishEvent).not.toHaveBeenCalled();
    expect(writes(foreign)).toEqual([]);
    const own = state({ releases: [releaseRow(OWN)], shops: [shopRow('building')] });
    const mine = conductorOf(own);
    await mine.conductor.resume();
    expect(mine.lines).toContain('release-shop-skipped');
  });

  it('onCheckResult: чужой идущий выпуск — ошибка release-foreign (не «негодное»), записей нет', async () => {
    const foreign = state({ releases: [releaseRow(OTHER)], shops: [shopRow('before')] });
    const other = conductorOf(foreign);
    await expect(other.conductor.onCheckResult(beforeResult)).rejects.toMatchObject({ code: 'release-foreign' });
    expect(writes(foreign)).toEqual([]);
    expect(other.lines).not.toContain('release-step-failed');
  });

  it('onCheckResult: чужой, но остановленный выпуск — опоздавший ответ отброшен; свой — шаг как раньше', async () => {
    const stopped = state({ releases: [releaseRow(OTHER, 'stopped')] });
    await expect(conductorOf(stopped).conductor.onCheckResult(beforeResult)).resolves.toBeUndefined();
    expect(writes(stopped)).toEqual([]);
    const own = state({ releases: [releaseRow(OWN)], shops: [shopRow('before')] });
    const mine = conductorOf(own);
    await mine.conductor.onCheckResult(beforeResult);
    expect(mine.lines).toContain('release-shop-skipped');
  });

  it('afterBuild: чужой выпуск — ничего не пишет; свой — магазин на паузе уходит пропуском', async () => {
    const build = { siteId: SHOP, build: 5, outcome: 'paused' as const, code: null, error: null };
    const foreign = state({ releases: [releaseRow(OTHER)], shops: [shopRow('building')] });
    await conductorOf(foreign).conductor.afterBuild(build);
    expect(writes(foreign)).toEqual([]);
    const own = state({ releases: [releaseRow(OWN)], shops: [shopRow('building')] });
    const mine = conductorOf(own);
    await mine.conductor.afterBuild(build);
    expect(mine.lines).toContain('release-shop-skipped');
  });
});

function builderOf(fake: FakeState) {
  const lines: string[] = [];
  const db = fakeDb(fake);
  const log = (message: string) => void lines.push(message);
  const call = () => Promise.reject(refused);
  const shell = { version: '0.1.0', hash: OWN, parts: [], code: '' };
  const deps: BuilderDeps = {
    db,
    store,
    snapshot: {
      db,
      products: { call, timeoutMs: 1_000, log },
      code: { db, shell, call, timeoutMs: 1_000, log },
      counters: { call, timeoutMs: 1_000, log },
      platform: {
        renderHash: OWN,
        apiUrl: 'https://gateway.dev.merfy.ru/api',
        analyticsUrl: 'https://analytics.dev.merfy.ru',
      },
      themes: new Map(),
      pins: { stateOf: () => Promise.resolve(null), released: () => Promise.resolve('0.0.1') },
      clock: () => new Date(),
    },
    themes: new Map(),
    catalog: { themeAt: () => Promise.reject(refused) },
    platformCommit: 'c'.repeat(40),
    indexable: false,
    shopState: { leaseMs: 60_000, retryDelaysMs: [100] },
    releaseSlots: 1,
    clock: () => new Date(),
    log,
    enqueue: () => Promise.resolve(),
    alert: () => Promise.resolve(),
  };
  return { deps, lines };
}

const CLAIM = 'UPDATE storefront_shop SET started_at';

describe('сборка и чужой выпуск платформы (П10-7 А)', () => {
  it('магазин в сборке чужого выпуска — задание не взято, ошибка release-foreign, одна строка журнала', async () => {
    const foreign = state({ foreign: [{ id: 7 }] });
    const { deps, lines } = builderOf(foreign);
    await expect(runBuildJob(deps, { siteId: SHOP, build: 5 })).rejects.toMatchObject({ code: 'release-foreign' });
    expect(foreign.sql.some((text) => text.includes(CLAIM))).toBe(false);
    expect(lines).toEqual(['release-foreign-build']);
  });

  it('чужого выпуска нет — задание берётся как раньше', async () => {
    const own = state();
    const { deps, lines } = builderOf(own);
    await runBuildJob(deps, { siteId: SHOP, build: 5 });
    expect(own.sql.some((text) => text.includes(CLAIM))).toBe(true);
    expect(lines).toEqual(['job-skipped']);
  });
});
