import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Passport } from '@merfy/stand-check';
import { parseChangelog } from '@merfy/storefront-build';
import { releaseShotKey, rendererIndexKey } from '@merfy/storefront-storage';
import { parseTheme, type TokenMigrations } from '@merfy/tokens';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ensureRendererArchive, readRendererIndex } from '../../src/renderer-archive';
import { parseCommand, runCommand, type CommandDeps } from '../../src/release/command';
import {
  bootstrapRelease,
  readRelease,
  releaseShops,
  releasedVersion,
  setRelease,
  setShop,
  type ReleaseRow,
} from '../../src/release/store';
import { repoVersion, versionFiles } from '../../src/release/versions';
import { openHarness } from './builder';
import { insertSite, resetBuilder } from './stack';

// Команда выпуска на стенде (design.md блока 10, «Команда выпуска»): база и MinIO настоящие, браузер и версии —
// подставные, роль ведущего волн играет тест. Выпуск 0.0.1 → 0.0.9.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FROM = '0.0.1';
const TO = '0.0.9';
const TO_HASH = `sha256:${'9'.repeat(64)}`;
const harness = openHarness();
const db = harness.db;
const themeFile = join(ROOT, 'packages', 'theme-nova', 'theme.json');
const novaTokens = z.object({ tokens: z.unknown() }).parse(JSON.parse(await readFile(themeFile, 'utf8'))).tokens;
const NONE: TokenMigrations = { v: 1, steps: [] };
// Переименование в имя, которого 0.0.1 не знает: сухой прогон красный по правилу двух выпусков.
const RENAME: TokenMigrations = {
  v: 1,
  steps: [{ id: 'rename-1', version: TO, kind: 'rename', from: 'no-such-token', to: 'renamed-token' }],
};
const LOG = parseChangelog({
  v: 1,
  versions: [
    { version: TO, date: '2026-10-12', lines: [{ kind: 'fix', text: 'Исправили отступ' }] },
    { version: FROM, date: '2026-10-09', lines: [{ kind: 'fix', text: 'Первая версия' }] },
  ],
});
// PNG 1×1: «до» и «после» одинаковые — доля отличий 0.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PASSPORT: Passport = {
  version: 1,
  page: '/',
  target: 'dev',
  scripts: [],
  globals: {},
  storage: [],
  cookies: [],
  requests: [],
  errors: [],
  tokens: {},
  fonts: [],
};

interface Setup {
  contour?: 'dev' | 'prod';
  red?: boolean;
}

async function depsWith(setup: Setup = {}): Promise<{ deps: CommandDeps; lines: string[] }> {
  const lines: string[] = [];
  const migrations = setup.red === true ? RENAME : NONE;
  const deps: CommandDeps = {
    db,
    store: harness.store,
    contour: setup.contour ?? 'dev',
    root: ROOT,
    reportDir: await mkdtemp(join(tmpdir(), 'release-reports-')),
    publicUrl: 'http://stand.test/storefront-test',
    startedBy: 'stack-test',
    clock: () => new Date(),
    say: (line) => {
      lines.push(line);
    },
    browser: {
      passport: () => Promise.resolve(PASSPORT),
      shots: () => Promise.resolve([{ page: 'home', width: 390, png: PIXEL }]),
    },
    versions: (themeId, version) => {
      expect(themeId).toBe('nova');
      return Promise.resolve({
        version,
        theme: parseTheme(novaTokens),
        migrations: version === TO ? migrations : NONE,
        changelog: LOG,
      });
    },
    pollMs: 100,
    waitMs: 10_000,
  };
  return { deps, lines };
}

const LATEST_SQL = 'SELECT id FROM storefront_release WHERE to_version = $1 ORDER BY id DESC LIMIT 1';

async function latest(): Promise<ReleaseRow | null> {
  const { rows } = await db.query(LATEST_SQL, [TO]);
  const id = rows.map((row) => z.object({ id: z.number() }).parse(row).id).at(0);
  return id === undefined ? null : readRelease(db, id);
}

async function eventually<T>(read: () => Promise<T | null>): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('не дождались за 10 с');
}

async function shops(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) ids.push((await insertSite(db, { name: `Магазин ${index}` })).id);
  return ids;
}

// Ведущий волн в роли теста: тестовый магазин закреплён на новой версии и done, выпуск awaiting.
async function passWaveZero(siteId: string): Promise<ReleaseRow> {
  const release = await eventually(latest);
  await db.query('UPDATE site SET theme_version = $2 WHERE id = $1', [siteId, TO]);
  await setShop(db, { releaseId: release.id, siteId }, ['waiting'], {
    status: 'done',
    verdict: 'clean',
    versionBefore: FROM,
  });
  await setRelease(db, release.id, ['testing'], { status: 'awaiting' });
  return release;
}

const start = (deps: CommandDeps, ...flags: string[]) =>
  runCommand(deps, parseCommand(['start', 'nova', '--version', TO, ...flags]));

beforeEach(async () => {
  await resetBuilder(db);
  await db.query("UPDATE site SET deleted_at = now() WHERE theme_id = 'nova' AND deleted_at IS NULL");
  const bootstrap = { version: FROM, contentHash: `sha256:${'1'.repeat(64)}` };
  await bootstrapRelease(db, 'nova', bootstrap, 'dev');
  await bootstrapRelease(db, 'nova', bootstrap, 'prod');
  const index = await readRendererIndex(harness.store, 'nova');
  const entry = { contentHash: TO_HASH, bytes: 1, uploadedAt: new Date().toISOString() };
  const body = Buffer.from(JSON.stringify({ ...index, versions: { ...index.versions, [TO]: entry } }));
  await harness.store.write(rendererIndexKey('nova'), body, { contentType: 'application/json' });
});

afterAll(async () => {
  await harness.close();
});

describe('команда выпуска на стенде (design.md блока 10)', () => {
  it('сухой прогон красный: выпуска нет, отчёт с причиной, код 1', async () => {
    await shops(1);
    const { deps } = await depsWith({ red: true });
    expect(await start(deps)).toBe(1);
    expect(await latest()).toBeNull();
    const report = await readFile(join(deps.reportDir, 'dev', `dry-nova-${TO}`, 'report.md'), 'utf8');
    expect(report).toContain('Сухой прогон красный');
    expect(report).toContain('renamed-token');
  });

  it('магазинов темы нет: выпуск сразу finished, выпущенная версия — новая', async () => {
    const { deps } = await depsWith();
    expect(await start(deps)).toBe(0);
    expect((await latest())?.status).toBe('finished');
    expect(await releasedVersion(db, 'nova', 'dev')).toBe(TO);
  });

  it('волна 0: отчёт со снимками и паспортами, «да», состояние', async () => {
    const [testShop] = await shops(3);
    const { deps, lines } = await depsWith();
    const running = start(deps, '--test-shop', testShop);
    const release = await passWaveZero(testShop);
    expect(await running).toBe(0);
    const dir = join(deps.reportDir, 'dev', `${release.id}-nova-${TO}`);
    const report = await readFile(join(dir, 'report.md'), 'utf8');
    expect(report).toContain(`theme-release approve ${release.id}`);
    expect(report).toContain('| home, 390 px |');
    expect(JSON.parse(await readFile(join(dir, 'after.json'), 'utf8'))).toEqual(PASSPORT);
    for (const name of ['before', 'after', 'diff']) {
      expect(await harness.store.has(releaseShotKey(release.id, `${name}-home-390.png`))).toBe(true);
    }
    expect(await runCommand(deps, parseCommand(['approve', String(release.id)]))).toBe(0);
    const approved = await readRelease(db, release.id);
    expect(approved?.status).toBe('waves');
    expect(approved?.nextWaveAt).not.toBeNull();
    expect(await runCommand(deps, parseCommand(['approve', String(release.id)]))).toBe(1);
    expect(await runCommand(deps, parseCommand(['status']))).toBe(0);
    expect(lines.some((line) => line.startsWith(`№${release.id} theme nova ${FROM} → ${TO}: waves`))).toBe(true);
  });

  it('снять магазин и вернуть всех: закрепления прежние, строки журнала смены темы', async () => {
    const ids = await shops(4);
    const { deps } = await depsWith();
    const running = start(deps, '--test-shop', ids[0], '--no-shots');
    const release = await passWaveZero(ids[0]);
    expect(await running).toBe(0);
    for (const siteId of [ids[1], ids[2]]) {
      await db.query('UPDATE site SET theme_version = $2 WHERE id = $1', [siteId, TO]);
      await setShop(db, { releaseId: release.id, siteId }, ['waiting'], { status: 'building', versionBefore: FROM });
    }
    expect(await runCommand(deps, parseCommand(['skip', String(release.id), ids[1]]))).toBe(0);
    expect(await runCommand(deps, parseCommand(['revert-all', String(release.id)]))).toBe(0);
    expect(await runCommand(deps, parseCommand(['revert-all', String(release.id)]))).toBe(0);
    expect((await readRelease(db, release.id))?.status).toBe('reverted');
    const statuses = Object.fromEntries((await releaseShops(db, release.id)).map((shop) => [shop.siteId, shop.status]));
    expect(statuses).toEqual({ [ids[0]]: 'reverted', [ids[1]]: 'skipped', [ids[2]]: 'reverted', [ids[3]]: 'skipped' });
    const pins = await db.query('SELECT theme_version FROM site WHERE id = ANY($1)', [ids.slice(0, 3)]);
    expect(pins.rows).toEqual([{ theme_version: FROM }, { theme_version: FROM }, { theme_version: FROM }]);
    const journal = await db.query('SELECT 1 FROM site_theme_migrations WHERE site_id = ANY($1) AND to_version = $2', [
      ids.slice(0, 3),
      FROM,
    ]);
    expect(journal.rowCount).toBe(3);
    expect(await releasedVersion(db, 'nova', 'dev')).toBe(FROM);
  });

  it('прод: без отпечатка или с чужим — отказ', async () => {
    await shops(1);
    const { deps } = await depsWith({ contour: 'prod' });
    await expect(start(deps)).rejects.toThrow('--expect-hash');
    await expect(start(deps, '--expect-hash', `sha256:${'0'.repeat(64)}`)).rejects.toThrow(TO_HASH);
  });

  it('версии из архива рисовальщика и версия рабочей копии', async () => {
    const OLD = { version: TO, contentHash: TO_HASH };
    await ensureRendererArchive(
      { store: harness.store, log: harness.deps.log, clock: harness.deps.clock },
      ROOT,
      'nova',
      OLD,
    );
    const files = await versionFiles(harness.store, 'nova', TO, await mkdtemp(join(tmpdir(), 'release-versions-')));
    expect(files).toMatchObject({ version: TO, migrations: { v: 1 }, changelog: { v: 1 } });
    const theme = z.object({ version: z.string() }).parse(JSON.parse(await readFile(themeFile, 'utf8')));
    expect(await repoVersion(ROOT, 'nova')).toBe(theme.version);
  });
});
