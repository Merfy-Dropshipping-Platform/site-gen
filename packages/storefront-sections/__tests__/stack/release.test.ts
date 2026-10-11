import { fileURLToPath } from 'node:url';
import { createS3Store } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptReleases, type ReleaseFolder, type ReleaseLog } from '../../src/release';
import { STACK, openPool, resetSections } from './db';

// Дверь выпуска на стенде: секции платформы (packages/storefront-shell/sections) и «тема nova» — папка фикстур, где
// четыре секции проходят приём, а три нет.
const SECTIONS = fileURLToPath(new URL('../../fixtures/sections', import.meta.url));
const PLATFORM_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const PLATFORM: ReleaseFolder = { door: { author: 'platform', release: '0.1.0' }, root: PLATFORM_SECTIONS };
const THEME: ReleaseFolder = { door: { author: 'theme', theme: 'nova', release: '0.0.4' }, root: SECTIONS };

let db: Pool;
const lines: { message: string; fields: Readonly<Record<string, unknown>> }[] = [];
const log: ReleaseLog = (message, fields = {}) => void lines.push({ message, fields });

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  lines.length = 0;
  await resetSections(db);
});

const deps = () => ({ db, store: createS3Store(STACK.s3), log });

describe('дверь выпуска', () => {
  it('платформа и тема: принятые — строки с версией, отказ — строка журнала, остальные приняты; второй старт — без изменений', async () => {
    expect(await acceptReleases(deps(), [PLATFORM, THEME])).toEqual({ accepted: 5, unchanged: 0, refused: 3 });
    const refused = lines.filter((line) => line.message === 'section-refused');
    expect(refused.map((line) => String(line.fields.folder).split('/').at(-1))).toEqual([
      'bad-import',
      'bad-style',
      'shop-broken',
    ]);
    expect(String(refused[1]?.fields.problems)).toMatch(/^styles\.css:1:1 — /);
    const released = lines.filter((line) => line.message === 'section-release').map((line) => line.fields.name);
    expect(released).toEqual([
      'platform:cart-badge',
      'nova:locate',
      'nova:list',
      'nova:color-match',
      'nova:scarf-colors',
    ]);
    expect(await acceptReleases(deps(), [PLATFORM, THEME])).toEqual({ accepted: 0, unchanged: 5, refused: 3 });
  });

  it('папки секций нет — секций нет, не ошибка', async () => {
    const missing: ReleaseFolder = { ...THEME, root: `${SECTIONS}/нет-такой` };
    expect(await acceptReleases(deps(), [missing])).toEqual({ accepted: 0, unchanged: 0, refused: 0 });
  });
});
