import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Passport } from '@merfy/stand-check';
import { hashOf } from '@merfy/storefront-build';
import { acceptSection, publishDrafts, publishSection, readSectionFolder, type SectionFiles } from '@merfy/storefront-sections';
import { createS3Store, type ListedObject, type ObjectStore, type StoredObject } from '@merfy/storefront-storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EXIT, parseCommand, runCommand, type CommandDeps } from '../../src/release/command';
import { gitSectionVersions } from '../../src/release/section-versions';
import { readRelease } from '../../src/release/store';
import { STACK, insertSite, openPool, resetBuilder } from './stack';

// Подкоманда section команды theme-release (блок 15, часть 15з, Р15з-1, Р15з-8—Р15з-11) на стенде: разбор аргументов
// и запуск — сухой прогон, запись, «уже на новой», упавший магазин. Папка новой версии — во временном git-репозитории:
// в истории коммит с прежней версией, на диске — новая.
const LONG = 120_000;
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'];
const db = openPool();
const store = createS3Store(STACK.s3);
const OURS = fileURLToPath(new URL('../../../storefront-shell/sections/cart-badge', import.meta.url));
const NAME = 'shop:cart-badge';
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

let v1: SectionFiles;
let v2: SectionFiles;
let folder: string;
const withText = (files: SectionFiles, text: string): SectionFiles => ({
  ...files,
  'template.astro': (files['template.astro'] ?? '').replace('Корзина', text),
});

const rowCount = async (table: string): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n ?? -1;

// Папка секции в своём git-репозитории: коммит с v1, на диске — v2.
function newFolder(): void {
  const repo = mkdtempSync(join(tmpdir(), 's2-b15z-cov-cmd-'));
  folder = join(repo, 'sections', 'cart-badge');
  mkdirSync(join(repo, 'sections'), { recursive: true });
  cpSync(OURS, folder, { recursive: true });
  const git = (...args: string[]): string => execFileSync('git', [...GIT, ...args], { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'v1');
  writeFileSync(join(folder, 'template.astro'), v2['template.astro'] ?? '');
}

const failingStore: ObjectStore = {
  read: (): Promise<StoredObject | null> => Promise.resolve(null),
  has: (): Promise<boolean> => Promise.resolve(false),
  write: () => Promise.reject(new Error('хранилище недоступно')),
  list: (): Promise<ListedObject[]> => Promise.resolve([]),
  remove: (): Promise<void> => Promise.resolve(),
};

async function depsOf(sections: boolean, storeOverride?: ObjectStore): Promise<{ deps: CommandDeps; lines: string[] }> {
  const lines: string[] = [];
  const deps: CommandDeps = {
    db,
    store: storeOverride ?? store,
    contour: 'dev',
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    reportDir: await mkdtemp(join(tmpdir(), 's2-b15z-cov-reports-')),
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
    versions: () => Promise.reject(new Error('версии темы подкоманде section не нужны')),
    pollMs: 100,
    waitMs: 10_000,
    ...(sections ? { sections: { read: readSectionFolder, versions: gitSectionVersions } } : {}),
  };
  return { deps, lines };
}

const runCommandOf = async (args: string[], sections = true): Promise<{ code: number; lines: string[] }> => {
  const { deps, lines } = await depsOf(sections);
  const code = await runCommand(deps, parseCommand(args));
  return { code, lines };
};

async function seed(siteId: string, files: SectionFiles): Promise<void> {
  const result = await acceptSection({ db, store }, { author: 'shop', shopId: siteId }, files);
  expect(result.status).toBe('accepted');
  expect(await publishDrafts(db, siteId)).toContain(NAME);
}

beforeEach(async () => {
  await resetBuilder(db);
  await db.query('TRUNCATE storefront_section');
  v1 = await readSectionFolder(OURS);
  v2 = withText(v1, 'Корзина · cov');
  newFolder();
}, LONG);

afterAll(async () => {
  await db.end();
});

describe('команда section на стенде (часть 15з)', () => {
  it('разбирает аргументы: без флагов — сухой прогон и тема nova, --write и --test-shop — запись', () => {
    expect(parseCommand(['section', '../storefront-shell/sections/cart-drawer'])).toEqual({
      name: 'section',
      folder: '../storefront-shell/sections/cart-drawer',
      write: false,
      testShop: null,
      theme: 'nova',
    });
    expect(parseCommand(['section', 'x', '--write', '--test-shop', 's1', '--theme', 'nova'])).toEqual({
      name: 'section',
      folder: 'x',
      write: true,
      testShop: 's1',
      theme: 'nova',
    });
    expect(() => parseCommand(['section'])).toThrow();
  });

  it(
    'без источников версий — отказ; сухой прогон — код 0 и ничего не записано',
    async () => {
      const shop = await insertSite(db);
      await seed(shop.id, v1);
      const sections = await rowCount('storefront_section');
      await expect(runCommandOf(['section', folder], false)).rejects.toThrow(/не переданы источники версий секции/);
      const dry = await runCommandOf(['section', folder]);
      expect(dry.code).toBe(EXIT.done);
      expect(dry.lines.some((line) => line.includes('сухой прогон — ничего не записано'))).toBe(true);
      expect(dry.lines.some((line) => line.startsWith(`${shop.id}: update`))).toBe(true);
      expect([await rowCount('storefront_section'), await rowCount('storefront_release')]).toEqual([sections, 0]);
    },
    LONG,
  );

  it('выпуск расширения: строка планирования и отказ при повторе той же версии', async () => {
    const first = await runCommandOf(['extension', 'loyalty', '1.2.3']);
    expect(first.code).toBe(EXIT.done);
    expect(first.lines.some((line) => line.includes('расширение loyalty 0.0.0 → 1.2.3'))).toBe(true);
    const id = Number(first.lines.find((line) => line.includes('смотри status'))?.match(/№(\d+)/)?.[1] ?? 0);
    await db.query('UPDATE storefront_release SET status = $1 WHERE id = $2', ['finished', id]);
    await expect(runCommandOf(['extension', 'loyalty', '1.2.3'])).rejects.toThrow(/уже выпущена/);
  });

  it(
    'запись: код 0, отчёт и выпуск section; повтор — «ждут волны» и «уже на новой», нового выпуска нет',
    async () => {
      const [a, b] = [await insertSite(db), await insertSite(db)];
      for (const id of [a.id, b.id]) await seed(id, v1);
      const write = await runCommandOf(['section', folder, '--write', '--test-shop', a.id]);
      expect(write.code).toBe(EXIT.done);
      expect(write.lines.at(-1)).toContain('"write":true');
      expect(await publishSection(db, b.id, NAME, hashOf(v2))).toBe('published');
      const again = await runCommandOf(['section', folder, '--write']);
      expect(again.code).toBe(EXIT.done);
      expect(again.lines.at(-1)).toContain('"pending":1');
      expect(again.lines.some((line) => line.startsWith(`${b.id}: already`))).toBe(true);
      expect(await rowCount('storefront_release')).toBe(1);
      const id = Number(write.lines.find((line) => line.includes('смотри status'))?.match(/№(\d+)/)?.[1] ?? 0);
      expect(await readRelease(db, id)).toMatchObject({ kind: 'section', subject: NAME, status: 'testing' });
    },
    LONG,
  );

  it(
    'магазин упал при записи — код 1 и строка с ошибкой',
    async () => {
      const shop = await insertSite(db);
      await seed(shop.id, v1);
      const { deps, lines } = await depsOf(true, failingStore);
      const code = await runCommand(deps, parseCommand(['section', folder, '--write']));
      expect(code).toBe(EXIT.refused);
      expect(lines.some((line) => line.includes('failed — хранилище недоступно'))).toBe(true);
    },
    LONG,
  );
});
