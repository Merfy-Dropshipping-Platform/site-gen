import { randomUUID } from 'node:crypto';
import { sha256 } from '@merfy/storefront-build';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doorFields, type Door } from '../../src/doors';
import {
  currentDraft,
  findRelease,
  insertRelease,
  publishDrafts,
  rollbackSection,
  saveDraft,
  sectionHistory,
  visibleSections,
  type NewSection,
  type SectionRow,
} from '../../src/registry';
import { openPool, resetSections } from './db';

// Реестр секций на Postgres стенда: таблица storefront_section из миграции 0024 site-gen.
let db: Pool;

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await resetSections(db);
});

const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const OTHER_SHOP = '0b6f3c2e-8a41-4d5f-9c7e-1a2b3c4d5e6f';
const shopDoor: Door = { author: 'shop', shopId: SHOP };

// Строка реестра, как её отдаёт приём: исходник — одна строка текста, отпечатки — от неё.
function newSection(door: Door, name: string, source: string, kind: 'section' | 'global' = 'section'): NewSection {
  const fields = doorFields(door);
  const template = kind === 'section' ? `<p>${source}</p>` : '';
  return {
    door: fields,
    section: {
      name: `${fields.prefix}:${name}`,
      manifest: { sdk: 1, name, kind, title: name, settings: [] },
      template,
      script: null,
      warnings: [],
    },
    sourceHash: sha256(`source:${source}`),
    contentHash: sha256(`content:${source}`),
    scriptHash: null,
    source: { 'template.astro': template },
  };
}

const sourceOf = (source: string): string => sha256(`source:${source}`);
const labelOf = (row: SectionRow): string => `${row.name}@${row.release ?? 'shop'}`;

describe('реестр секций', () => {
  it('выпуск: строка с версией; та же версия второй раз — null, строка прежняя', async () => {
    const door: Door = { author: 'theme', theme: 'nova', release: '0.0.4' };
    const first = await insertRelease(db, newSection(door, 'scarf-colors', 'v1'));
    expect(first).toMatchObject({ name: 'nova:scarf-colors', author: 'theme', owner: 'nova', release: '0.0.4' });
    expect([first?.draft, first?.published]).toEqual([false, false]);
    expect(await insertRelease(db, newSection(door, 'scarf-colors', 'v2'))).toBeNull();
    const found = await findRelease(db, doorFields(door), 'nova:scarf-colors');
    expect([found?.id, found?.sourceHash]).toEqual([first?.id, sourceOf('v1')]);
  });

  it('своя секция: правка — новая текущая строка; тот же исходник — без новой строки', async () => {
    const first = await saveDraft(db, newSection(shopDoor, 'color-match', 'v1'));
    const again = await saveDraft(db, newSection(shopDoor, 'color-match', 'v1'));
    expect([first.created, again.created, again.row.id]).toEqual([true, false, first.row.id]);
    const second = await saveDraft(db, newSection(shopDoor, 'color-match', 'v2'));
    const history = await sectionHistory(db, SHOP, 'shop:color-match');
    expect(history.map((row) => [row.sourceHash, row.draft])).toEqual([
      [sourceOf('v1'), false],
      [sourceOf('v2'), true],
    ]);
    expect((await currentDraft(db, SHOP, 'shop:color-match'))?.id).toBe(second.row.id);
  });

  it('пять правок разом: под замком одна текущая, ни одна не потерялась', async () => {
    const sources = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const saved = await Promise.all(
      sources.map((source) => saveDraft(db, newSection(shopDoor, 'color-match', source))),
    );
    expect(saved.every((item) => item.created)).toBe(true);
    const history = await sectionHistory(db, SHOP, 'shop:color-match');
    expect(history.map((row) => row.sourceHash).sort()).toEqual(sources.map(sourceOf).sort());
    expect(history.filter((row) => row.draft)).toHaveLength(1);
  });

  it('публикация: текущие правки — на витрину, следующая правка ждёт следующей публикации', async () => {
    await saveDraft(db, newSection(shopDoor, 'color-match', 'v1'));
    await saveDraft(db, newSection(shopDoor, 'size-hint', 'w1'));
    expect(await publishDrafts(db, SHOP)).toEqual(['shop:color-match', 'shop:size-hint']);
    await saveDraft(db, newSection(shopDoor, 'color-match', 'v2'));
    const visibility = {
      platformRelease: '0.1.0',
      theme: { id: 'nova', version: '0.0.4' },
      shopId: SHOP,
      extensions: [],
    };
    const live = async (): Promise<string[]> => (await visibleSections(db, visibility)).map((row) => row.sourceHash);
    expect(await live()).toEqual([sourceOf('v1'), sourceOf('w1')]);
    expect(await publishDrafts(db, SHOP)).toEqual(['shop:color-match']);
    expect(await live()).toEqual([sourceOf('v2'), sourceOf('w1')]);
    expect(await publishDrafts(db, SHOP)).toEqual([]);
  });

  it('верни как было: прежняя строка снова текущая, новых строк нет; чужой id — null', async () => {
    const first = await saveDraft(db, newSection(shopDoor, 'color-match', 'v1'));
    await saveDraft(db, newSection(shopDoor, 'color-match', 'v2'));
    const back = await rollbackSection(db, SHOP, 'shop:color-match', first.row.id);
    expect([back?.id, back?.draft]).toEqual([first.row.id, true]);
    expect((await currentDraft(db, SHOP, 'shop:color-match'))?.id).toBe(first.row.id);
    expect(await sectionHistory(db, SHOP, 'shop:color-match')).toHaveLength(2);
    expect(await rollbackSection(db, SHOP, 'shop:color-match', randomUUID())).toBeNull();
    expect((await currentDraft(db, SHOP, 'shop:color-match'))?.id).toBe(first.row.id);
  });

  it('видимые магазину: выпуски его версий платформы, темы и включённых расширений; свои — опубликованные', async () => {
    const releases: [Door, string][] = [
      [{ author: 'platform', release: '0.1.0' }, 'cart-badge'],
      [{ author: 'platform', release: '0.2.0' }, 'cart-badge'],
      [{ author: 'theme', theme: 'nova', release: '0.0.4' }, 'scarf-colors'],
      [{ author: 'theme', theme: 'luxe', release: '1.0.0' }, 'scarf-colors'],
      [{ author: 'extension', extension: 'reviews', release: '1.4.0' }, 'list'],
      [{ author: 'extension', extension: 'reviews', release: '1.5.0' }, 'list'],
    ];
    await Promise.all(releases.map(([door, name]) => insertRelease(db, newSection(door, name, JSON.stringify(door)))));
    const geo: Door = { author: 'extension', extension: 'geo', release: '1.0.0' };
    await insertRelease(db, newSection(geo, 'locate', 'geo', 'global'));
    await saveDraft(db, newSection(shopDoor, 'color-match', 'v1'));
    await saveDraft(db, newSection({ author: 'shop', shopId: OTHER_SHOP }, 'color-match', 'чужая'));
    await publishDrafts(db, SHOP);
    await publishDrafts(db, OTHER_SHOP);
    const visible = await visibleSections(db, {
      platformRelease: '0.1.0',
      theme: { id: 'nova', version: '0.0.4' },
      shopId: SHOP,
      extensions: [{ id: 'reviews', version: '1.4.0' }],
    });
    expect(visible.map(labelOf)).toEqual([
      'nova:scarf-colors@0.0.4',
      'platform:cart-badge@0.1.0',
      'reviews:list@1.4.0',
      'shop:color-match@shop',
    ]);
    expect(visible.at(-1)?.owner).toBe(SHOP);
  });

  it('проверки таблицы: у выпуска есть версия, у своей секции — нет; флаги — только у своей; скрипт — с отпечатком', async () => {
    const insert = (author: string, release: string | null, draft: boolean, script: string | null) =>
      db.query(
        `INSERT INTO storefront_section (id, name, kind, author, owner, release, source_hash, content_hash, manifest,
          source, template, style, script, draft) VALUES ($1, 'nova:x', 'section', $2, 'nova', $3, 'h', 'h', '{}', '{}',
          '', '', $4, $5)`,
        [randomUUID(), author, release, script, draft],
      );
    await expect(insert('theme', null, false, null)).rejects.toThrow(/storefront_section_release_check/);
    await expect(insert('shop', '1.0.0', false, null)).rejects.toThrow(/storefront_section_release_check/);
    await expect(insert('theme', '1.0.0', true, null)).rejects.toThrow(/storefront_section_flags_check/);
    await expect(insert('theme', '1.0.0', false, 'код')).rejects.toThrow(/storefront_section_script_check/);
  });
});
