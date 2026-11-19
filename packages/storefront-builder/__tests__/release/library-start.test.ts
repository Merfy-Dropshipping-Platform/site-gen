import { fileURLToPath } from 'node:url';
import type { ObjectStore } from '@merfy/storefront-storage';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { Log } from '../../src/log';
import { runLibraryRelease, scheduleLibraryRelease, type LibraryRelease } from '../../src/release/library-start';
import type { ResaveCommand, ResaveDeps, ResaveReport } from '../../src/release/section';

// Автозапуск выпуска библиотечных секций (20.11): флаг, обход тем и папок, сбои — без базы и сети: работа секции —
// подставленная функция, база и хранилище до неё не доходят.
const SECTIONS_PACKAGE = fileURLToPath(new URL('../../../storefront-sections', import.meta.url));
const emptyReport = (name: string): ResaveReport => ({
  name,
  sourceHash: 'sha256:x',
  write: true,
  shops: [{ siteId: 's1', action: 'update', inRelease: true }],
  release: null,
  counts: { updated: 1, pending: 0, already: 0, skipped: 0, failed: 0 },
});

const noStore: ObjectStore = {
  read: () => Promise.resolve(null),
  has: () => Promise.resolve(false),
  write: () => Promise.resolve({ written: false }),
  list: () => Promise.resolve([]),
  remove: () => Promise.resolve(),
};

interface Seen {
  folder: string;
  write: boolean;
  testShop: string | null;
  theme: string;
  startedBy: string;
}

type Base = Omit<LibraryRelease, 'folders' | 'stopped'>;

function harness(overrides: Partial<Base> = {}) {
  const lines: { message: string; fields: object }[] = [];
  const seen: Seen[] = [];
  const log: Log = (message, fields = {}) => lines.push({ message, fields });
  const resave = (deps: ResaveDeps, command: ResaveCommand): Promise<ResaveReport> => {
    const { folder, write, testShop, theme } = command;
    seen.push({ folder, write, testShop, theme, startedBy: deps.startedBy });
    return folder === 'bad' ? Promise.reject(new Error('не прошла проверку')) : Promise.resolve(emptyReport(folder));
  };
  // Работа секции подставлена: пул не подключается (лениво), хранилище не читается.
  const base: Base = {
    db: new Pool({ connectionString: 'postgres://u:p@127.0.0.1:1/none' }),
    store: noStore,
    contour: 'dev',
    themeIds: ['nova'],
    testShop: 'shop-t',
    log,
    resave,
    ...overrides,
  };
  return { base, lines, seen };
}

const folders = (): Promise<string[]> => Promise.resolve(['a', 'bad', 'b']);

describe('выпуск библиотечных секций при старте', () => {
  it('каждая папка — запись (write) с тестовым магазином и от имени сборщика; папка с ошибкой остальные не останавливает', async () => {
    const { base, lines, seen } = harness();
    const done = await runLibraryRelease({ ...base, folders });
    expect(seen.map((item) => item.folder)).toEqual(['a', 'bad', 'b']);
    expect(seen.every((item) => item.write && item.testShop === 'shop-t' && item.theme === 'nova')).toBe(true);
    expect(seen.every((item) => item.startedBy === 'builder')).toBe(true);
    expect(done.get('nova')).toMatchObject({ folders: 3, updated: 2, failed: 1 });
    expect(lines.map((line) => line.message)).toEqual(['library-release', 'library-release-folder-failed']);
  });

  it('сбой темы (список папок не получен) в журнале, следующая тема идёт', async () => {
    let calls = 0;
    const flaky = (): Promise<string[]> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('нет каталога')) : Promise.resolve(['a']);
    };
    const { base, lines } = harness({ themeIds: ['rose', 'nova'] });
    const done = await runLibraryRelease({ ...base, folders: flaky });
    expect([...done.keys()]).toEqual(['nova']);
    expect(lines.map((line) => line.message)).toEqual(['library-release-failed', 'library-release']);
  });

  it('остановка сборщика — следующая папка и следующая тема не начинаются', async () => {
    let asked = 0;
    const { base, seen } = harness({ themeIds: ['nova', 'rose'] });
    await runLibraryRelease({ ...base, folders, stopped: () => asked++ >= 2 });
    expect(seen.map((item) => item.folder)).toEqual(['a']);
  });
});

describe('запуск после старта по флагу', () => {
  it('флаг выключен — строка в журнале и ни одной папки', async () => {
    const { base, lines, seen } = harness();
    scheduleLibraryRelease({ ...base, enabled: false, packageDir: SECTIONS_PACKAGE, delayMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([]);
    expect(lines.map((line) => line.message)).toEqual(['library-release-disabled']);
  });

  it('флаг включён — после паузы обходит папки библиотеки образа (fixtures/shop и секции оболочки)', async () => {
    const { base, seen } = harness();
    scheduleLibraryRelease({ ...base, enabled: true, packageDir: SECTIONS_PACKAGE, delayMs: 1 });
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(36));
    expect(seen.some((item) => item.folder.endsWith('/fixtures/shop/hero'))).toBe(true);
    expect(seen.some((item) => item.folder.endsWith('/storefront-shell/sections/cart'))).toBe(true);
  });

  it('stop до срабатывания — ничего не запускается', async () => {
    const { base, seen } = harness();
    const schedule = scheduleLibraryRelease({ ...base, enabled: true, packageDir: SECTIONS_PACKAGE, delayMs: 20 });
    schedule.stop();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(seen).toEqual([]);
  });
});
