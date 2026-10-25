import { sha256 } from '@merfy/storefront-build';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doorFields, type Door } from '../../src/doors';
import {
  RoleTakenError,
  currentDraft,
  publishDrafts,
  rollbackBroken,
  rollbackSection,
  saveDraft,
  sectionHistory,
  type NewSection,
  type SectionRow,
} from '../../src/registry';
import type { SectionRole } from '../../src/roles';
import { openPool, resetSections } from './db';

// Откат секции с ролью по ошибкам (блок 12 «Секций и SDK», часть 12в; design.md блока 12, В12-1 А): прежняя правка,
// которая была на витрине, снова на витрине; под замком владельца — один откат на два сигнала; роль прежней правки
// другая или занята — отката нет. «Верни как было» к правке, чья роль занята другой секцией, — RoleTakenError.
const SHOP = '5c1e7a90-2b3d-4f6a-8c9e-0d1f2a3b4c5d';
const DRAWER = 'shop:cart-drawer';
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

const scriptHashOf = (name: string, version: string): string => sha256(`script:${name}:${version}`);
const H = (version: string): string => scriptHashOf(DRAWER, version);
// Часы сборщика: откат той же роли — не чаще раза в сутки.
const T0 = new Date('2026-10-24T09:00:00.000Z');
const hours = (n: number): Date => new Date(T0.getTime() + n * 3_600_000);

// Правка своей секции со скриптом, как её отдаёт приём; роль — в manifest.
function edit(name: string, version: string, role?: SectionRole): NewSection {
  const door: Door = { author: 'shop', shopId: SHOP };
  const short = name.slice('shop:'.length);
  const template = `<p>${version}</p>`;
  const roleKey = role === undefined ? {} : { role };
  return {
    door: doorFields(door),
    section: {
      name,
      manifest: { sdk: 1, name: short, kind: 'section', title: short, settings: [], ...roleKey },
      template,
      render: null,
      script: `export default { version: '${version}' };`,
      warnings: [],
      scriptMeta: { uses: [], parts: [], classes: [] },
    },
    sourceHash: sha256(`source:${name}:${version}`),
    contentHash: sha256(`content:${name}:${version}`),
    renderHash: null,
    scriptHash: scriptHashOf(name, version),
    // Отклонение от плана (правило 24.10): NewSection в dev требует tokenOrder — в тексте карточки его нет.
    tokenOrder: null,
    source: { 'template.astro': template },
  };
}

// Сохранить и опубликовать правку — как приём и публикация магазина.
async function publish(name: string, version: string, role?: SectionRole): Promise<void> {
  await saveDraft(db, edit(name, version, role));
  await publishDrafts(db, SHOP);
}

async function rowOf(name: string, version: string): Promise<SectionRow> {
  const found = (await sectionHistory(db, SHOP, name)).find((row) => row.scriptHash === scriptHashOf(name, version));
  if (found === undefined) throw new Error(`нет правки ${version}`);
  return found;
}

// Правки секции по времени приёма: [отпечаток скрипта, текущая, на витрине].
async function flags(name: string): Promise<[string | null, boolean, boolean][]> {
  return (await sectionHistory(db, SHOP, name)).map((row) => [row.scriptHash, row.draft, row.published]);
}

describe('откат секции с ролью по ошибкам', () => {
  it('прежняя опубликованная правка — снова на витрине и текущая; правка с ошибкой снята', async () => {
    await publish(DRAWER, 'v1', 'cart-drawer');
    await publish(DRAWER, 'v2', 'cart-drawer');
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), T0)).toMatchObject({
      status: 'rolled-back',
      from: { scriptHash: H('v2') },
      to: { scriptHash: H('v1'), draft: true, published: true },
    });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), true, true],
      [H('v2'), false, false],
    ]);
  });

  it('правка, которую мерчант сохранил после публикации, остаётся текущей', async () => {
    await publish(DRAWER, 'v1', 'cart-drawer');
    await publish(DRAWER, 'v2', 'cart-drawer');
    await saveDraft(db, edit(DRAWER, 'v3', 'cart-drawer'));
    expect((await rollbackBroken(db, SHOP, DRAWER, H('v2'), T0)).status).toBe('rolled-back');
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, true],
      [H('v2'), false, false],
      [H('v3'), true, false],
    ]);
  });

  it('правка, которую не публиковали, прежней не считается — no-previous, ничего не меняется', async () => {
    await saveDraft(db, edit(DRAWER, 'v1', 'cart-drawer'));
    await publish(DRAWER, 'v2', 'cart-drawer');
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), T0)).toMatchObject({
      status: 'no-previous',
      from: { scriptHash: H('v2') },
    });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), true, true],
    ]);
  });

  it('на витрине другая правка или секция без роли — stale, ничего не меняется', async () => {
    await publish(DRAWER, 'v1', 'cart-drawer');
    await publish(DRAWER, 'v2', 'cart-drawer');
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v1'), T0)).toEqual({ status: 'stale' });
    await publish('shop:hero', 'v1');
    await publish('shop:hero', 'v2');
    const hero = scriptHashOf('shop:hero', 'v2');
    expect(await rollbackBroken(db, SHOP, 'shop:hero', hero, T0)).toEqual({ status: 'stale' });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), true, true],
    ]);
  });

  it('два сигнала разом — один откат, на одну правку назад', async () => {
    for (const version of ['v1', 'v2', 'v3']) await publish(DRAWER, version, 'cart-drawer');
    const outcomes = await Promise.all([
      rollbackBroken(db, SHOP, DRAWER, H('v3'), T0),
      rollbackBroken(db, SHOP, DRAWER, H('v3'), T0),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['rolled-back', 'stale']);
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), true, true],
      [H('v3'), false, false],
    ]);
  });

  it('снятая откатом правка сама не возвращается: следующий откат — к правке до неё', async () => {
    for (const version of ['v1', 'v2', 'v3']) await publish(DRAWER, version, 'cart-drawer');
    await rollbackBroken(db, SHOP, DRAWER, H('v3'), T0);
    expect((await rollbackBroken(db, SHOP, DRAWER, H('v2'), hours(25))).status).toBe('rolled-back');
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), true, true],
      [H('v2'), false, false],
      [H('v3'), false, false],
    ]);
  });

  it('второй откат той роли за сутки — cooldown, запись мерчанту одна; через 25 часов — откат', async () => {
    for (const version of ['v1', 'v2', 'v3']) await publish(DRAWER, version, 'cart-drawer');
    expect((await rollbackBroken(db, SHOP, DRAWER, H('v3'), T0)).status).toBe('rolled-back');
    const cooldown = { status: 'cooldown' };
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), hours(1))).toMatchObject({ ...cooldown, notify: true });
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), hours(2))).toMatchObject({ ...cooldown, notify: false });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), true, true],
      [H('v3'), false, false],
    ]);
    expect((await rollbackBroken(db, SHOP, DRAWER, H('v2'), hours(25))).status).toBe('rolled-back');
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), true, true],
      [H('v2'), false, false],
      [H('v3'), false, false],
    ]);
  });

  it('у прежней правки роли нет — role-changed, ничего не меняется', async () => {
    await publish(DRAWER, 'v1');
    await publish(DRAWER, 'v2', 'cart-drawer');
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), T0)).toMatchObject({
      status: 'role-changed',
      to: { scriptHash: H('v1') },
    });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), true, true],
    ]);
  });

  it('роль прежней правки занята другой секцией — role-taken с её именем, ничего не меняется', async () => {
    await publish(DRAWER, 'v1', 'cart-drawer');
    await publish(DRAWER, 'v2', 'cart-drawer');
    await saveDraft(db, edit(DRAWER, 'v3'));
    await saveDraft(db, edit('shop:my-cart-drawer', 'v1', 'cart-drawer'));
    expect(await rollbackBroken(db, SHOP, DRAWER, H('v2'), T0)).toMatchObject({
      status: 'role-taken',
      holder: 'shop:my-cart-drawer',
    });
    expect(await flags(DRAWER)).toEqual([
      [H('v1'), false, false],
      [H('v2'), false, true],
      [H('v3'), true, false],
    ]);
  });
});

describe('«верни как было» и роль', () => {
  it('роль правки занята другой секцией — RoleTakenError, текущая правка прежняя', async () => {
    await saveDraft(db, edit(DRAWER, 'v1', 'cart-drawer'));
    await saveDraft(db, edit(DRAWER, 'v2'));
    await saveDraft(db, edit('shop:my-cart-drawer', 'v1', 'cart-drawer'));
    const refused = rollbackSection(db, SHOP, DRAWER, (await rowOf(DRAWER, 'v1')).id);
    await expect(refused).rejects.toBeInstanceOf(RoleTakenError);
    await expect(refused).rejects.toMatchObject({ role: 'cart-drawer', holder: 'shop:my-cart-drawer' });
    expect((await currentDraft(db, SHOP, DRAWER))?.scriptHash).toBe(H('v2'));
  });

  it('роль свободна — откат как раньше', async () => {
    await saveDraft(db, edit(DRAWER, 'v1', 'cart-drawer'));
    await saveDraft(db, edit(DRAWER, 'v2', 'cart-drawer'));
    const v1 = await rowOf(DRAWER, 'v1');
    expect(await rollbackSection(db, SHOP, DRAWER, v1.id)).toMatchObject({ id: v1.id, draft: true });
  });
});
