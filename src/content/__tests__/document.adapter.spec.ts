/**
 * `DocumentAdapter` против общего набора `runStoreContentConformance` +
 * несколько адаптер-специфичных проверок.
 *
 * Фейковая БД собрана по образцу `site-create-theme.characterization.spec.ts`
 * (`withLimit`/`withReturning`, `makeBareService()` для `buildInitialRevision`)
 * и `revision-create-cas.spec.ts` (транзакция со стейджингом insert, разбор
 * CAS-предиката через `PgDialect().sqlToQuery(cond)` — тот же приём, которым
 * ЭТОТ файл сам проверяет SQL CAS-предиката).
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { DocumentAdapter } from '../document.adapter';
import { SitesDomainService } from '../../sites.service';
import { RevisionNotFoundError } from '../store-content.port';
import * as schema from '../../db/schema';
import {
  runStoreContentConformance,
  type ConformanceFixture,
  type ConformanceSeed,
} from './store-content.conformance';

const dialect = new PgDialect();
function paramsOf(cond: unknown): unknown[] {
  return dialect.sqlToQuery(cond as never).params;
}
function sqlOf(cond: unknown): string {
  return dialect.sqlToQuery(cond as never).sql;
}

type RevisionRow = {
  id: string;
  siteId: string;
  data: unknown;
  meta: unknown;
  createdAt: Date;
  createdBy?: string;
};

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function makeBareService(): any {
  const dep = {} as any;
  return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
}

/**
 * Фейковая БД, покрывающая РОВНО те вызовы, что делает `DocumentAdapter`:
 * select по `siteRevision` (id [+siteId]), insert `siteRevision`, update
 * `site.current_revision_id` (безусловно ИЛИ CAS — различается по SQL самого
 * предиката, тем же приёмом, что `revision-create-cas.spec.ts`), transaction
 * со стейджингом insert (коммит только при успехе callback — имитация
 * ROLLBACK на исключении).
 */
function makeFakeDb(site: { id: string; tenantId: string; currentRevisionId: string | null }) {
  const revisions = new Map<string, RevisionRow>();

  function selectSiteRevision(cond: unknown) {
    const params = paramsOf(cond);
    const id = params[0] as string;
    const row = revisions.get(id);
    if (!row) return Promise.resolve([]);
    if (params.length > 1 && row.siteId !== params[1]) return Promise.resolve([]);
    return Promise.resolve([row]);
  }

  /** update(schema.site).set(patch).where(cond) — общая для db и tx. */
  function performSiteUpdate(cond: unknown, patch: Record<string, unknown>) {
    const sql = sqlOf(cond);
    const params = paramsOf(cond);
    const isCasEq = sql.includes('"site"."current_revision_id" =');
    const isCasNull = sql.includes('"site"."current_revision_id" is null');
    if (!isCasEq && !isCasNull) {
      // Безусловный путь (setCurrent без expectedVersion): .returning() не
      // зовётся, применяем сразу — как в реальном коде.
      Object.assign(site, patch);
      return Promise.resolve([]);
    }
    const expected = isCasNull ? null : (params[params.length - 1] as string);
    const matches = site.currentRevisionId === expected;
    const rows = matches ? [{ id: site.id }] : [];
    const result: any = Promise.resolve(rows);
    result.returning = async (_proj: unknown) => {
      if (matches) Object.assign(site, patch);
      return rows;
    };
    return result;
  }

  const db: any = {
    select: (_proj?: unknown) => ({
      from: (_tbl: unknown) => ({
        where: (cond: unknown) => selectSiteRevision(cond),
      }),
    }),
    insert: (_tbl: unknown) => ({
      values: async (value: RevisionRow) => {
        revisions.set(value.id, { ...value });
      },
    }),
    update: (_tbl: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => performSiteUpdate(cond, patch),
      }),
    }),
    transaction: async (callback: (tx: unknown) => Promise<void>) => {
      const staged: RevisionRow[] = [];
      const tx = {
        insert: (_tbl: unknown) => ({
          values: async (value: RevisionRow) => {
            staged.push({ ...value });
          },
        }),
        update: (_tbl: unknown) => ({
          set: (patch: Record<string, unknown>) => ({
            where: (cond: unknown) => performSiteUpdate(cond, patch),
          }),
        }),
      };
      await callback(tx);
      // Коммит стейджинга ТОЛЬКО если callback не бросил — имитация ROLLBACK.
      for (const row of staged) revisions.set(row.id, row);
    },
  };

  return {
    db,
    revisions,
    countStoredRevisions: () => revisions.size,
    readStoredRevision: (id: string) => revisions.get(id)?.data as Record<string, unknown> | undefined,
  };
}

async function makeAdapter(seed: ConformanceSeed): Promise<ConformanceFixture> {
  const siteId = nextId('site');
  const tenantId = nextId('tenant');
  const site = { id: siteId, tenantId, currentRevisionId: null as string | null };
  const store = makeFakeDb(site);

  const builder = makeBareService();
  const initialDocument = await builder.buildInitialRevision(seed.themeId);
  const initialRevisionId = nextId('rev');
  store.revisions.set(initialRevisionId, {
    id: initialRevisionId,
    siteId,
    data: initialDocument,
    meta: {},
    createdAt: new Date(0),
  });
  site.currentRevisionId = initialRevisionId;

  const content = new DocumentAdapter(store.db);
  const siteContext = {
    themeId: seed.themeId,
    publicUrl: seed.publicUrl ?? null,
    name: seed.siteName ?? 'Витрина',
    contentModel: 'document',
    get currentRevisionId() {
      return site.currentRevisionId;
    },
  };

  return {
    content,
    siteId,
    site: siteContext,
    tenantId,
    currentRevisionId: () => site.currentRevisionId,
    countStoredRevisions: store.countStoredRevisions,
    readStoredRevision: store.readStoredRevision,
  };
}

describe('DocumentAdapter — набор поведения порта StoreContent', () => {
  runStoreContentConformance(makeAdapter);
});

describe('DocumentAdapter — специфичные проверки адаптера', () => {
  it('load без сохранённой ревизии падает revision_not_found', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    const adapter = new DocumentAdapter(store.db);

    await expect(
      adapter.load(siteId, {
        site: { themeId: 'rose', publicUrl: null, currentRevisionId: null },
      }),
    ).rejects.toThrow('revision_not_found');
  });

  it('save без setCurrent просто добавляет ревизию, site.currentRevisionId не трогает', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: 'rev-old' };
    const store = makeFakeDb(site);
    store.revisions.set('rev-old', {
      id: 'rev-old',
      siteId,
      data: {},
      meta: {},
      createdAt: new Date(0),
    });
    const adapter = new DocumentAdapter(store.db);

    const result = await adapter.save(siteId, {
      mode: 'blind',
      document: { pages: [] },
      filterSeeded: false,
      tenantId: site.tenantId,
      site: { themeId: 'rose', publicUrl: null, currentRevisionId: site.currentRevisionId },
    });

    expect(store.countStoredRevisions()).toBe(2);
    expect(site.currentRevisionId).toBe('rev-old');
    expect(result.version).not.toBe('rev-old');
  });

  // R3: колонка `kind` (миграция 0020) зеркалит `meta.kind` — то же значение,
  // что раньше читался только из jsonb (revision-kinds.ts теперь читает
  // колонку). Обычная запись — kind не задан (null); снимок клиента (то, что
  // реально пишет save-on-base.ts.snapshotRow) — kind = 'client-snapshot'.
  it('save() пишет колонку kind из meta.kind (совместимость с revision-kinds.ts)', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    const adapter = new DocumentAdapter(store.db);

    await adapter.save(siteId, {
      mode: 'blind',
      document: { pages: [] },
      filterSeeded: false,
      tenantId: site.tenantId,
      site: { themeId: 'rose', publicUrl: null, currentRevisionId: null },
    });
    const [plainId] = [...store.revisions.keys()];
    expect((store.revisions.get(plainId) as { kind?: string | null }).kind).toBeNull();

    await adapter.save(siteId, {
      mode: 'blind',
      document: { pages: [] },
      meta: { kind: 'client-snapshot' },
      filterSeeded: false,
      tenantId: site.tenantId,
      site: { themeId: 'rose', publicUrl: null, currentRevisionId: null },
    });
    const snapshotId = [...store.revisions.keys()].find((id) => id !== plainId)!;
    expect((store.revisions.get(snapshotId) as { kind?: string | null }).kind).toBe(
      'client-snapshot',
    );
  });

  // На время выкатки миграции 0020 рядом
  // со старым контейнером тот пишет снимки с meta.kind, но колонку kind не
  // знает (осталась бы NULL) — coalesce(kind, meta->>'kind', '') в
  // revision-kinds.ts обязан такую строку тоже считать снимком клиента.
  it('history(): переходный период 0020 — снимок с meta.kind при пустой колонке kind в историю не попадает', async () => {
    const siteId = nextId('site');
    const rows = [
      {
        id: 'r-old-snapshot',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        kind: null as string | null, // старый контейнер колонку не писал
        meta: { kind: 'client-snapshot' },
      },
      {
        id: 'r-normal',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        kind: null as string | null,
        meta: { actor: 'merchant' },
      },
    ];
    const db: any = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            // Рыхлая проверка на "coalesce" одна не различила бы саботаж:
            // coalesce(kind, '') — тоже "coalesce", но без запасного пути на
            // meta. Нужен именно запасной путь meta->>'kind' в тексте SQL.
            expect(sqlOf(cond)).toContain('coalesce');
            expect(sqlOf(cond)).toContain(`"meta"->>'kind'`);
            // Имитация Postgres: coalesce(kind, meta->>'kind', '') <> 'client-snapshot'.
            const visible = rows.filter(
              (r) => (r.kind ?? (r.meta as { kind?: string }).kind ?? '') !== 'client-snapshot',
            );
            return {
              orderBy: () => ({
                limit: async (n: number) =>
                  [...visible]
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, n),
              }),
            };
          },
        }),
      }),
    };
    const adapter = new DocumentAdapter(db);
    const site = { themeId: 'rose', publicUrl: null, currentRevisionId: null };

    const page = await adapter.history(siteId, { site, limit: 10 });
    expect(page.items.map((i) => i.id)).toEqual(['r-normal']);
  });

  // R2 (В4, `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`): ревизия и
  // правка строки site (например, смена темы) — ОДНА транзакция. Раньше
  // (SetTheme) это были два отдельных запроса: при сбое между ними ревизия
  // новой темы уже текущая, а themeId — ещё старый.
  it('save({mode: "blind", sitePatch}) применяет sitePatch к site в ТОЙ ЖЕ транзакции', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: 'rev-old' };
    const store = makeFakeDb(site);
    store.revisions.set('rev-old', {
      id: 'rev-old',
      siteId,
      data: {},
      meta: {},
      createdAt: new Date(0),
    });
    const adapter = new DocumentAdapter(store.db);

    const result = await adapter.save(siteId, {
      mode: 'blind',
      document: { pages: [] },
      filterSeeded: false,
      tenantId: site.tenantId,
      setCurrent: true,
      expectedVersion: 'rev-old',
      sitePatch: { themeId: 'flux', themeAppliedAt: new Date(0) },
      site: { themeId: 'rose', publicUrl: null, currentRevisionId: site.currentRevisionId },
    });

    expect(result.version).not.toBe('rev-old');
    expect(site.currentRevisionId).toBe(result.version);
    expect((site as { themeId?: string }).themeId).toBe('flux');
  });

  // Саботаж этого теста (описан в отчёте): вернуть sitePatch отдельным
  // db.update ПОСЛЕ commit() — тест ниже (сбой между вставкой и обновлением)
  // красится, потому что вставка ревизии тогда уже не в одной транзакции с
  // патчем и переживает якобы «откаченный» сбой.
  it('sitePatch: сбой ПОСЛЕ вставки ревизии, но ДО обновления site — в базе нет ни новой ревизии, ни новой темы', async () => {
    const siteId = nextId('site');
    const tenantId = nextId('tenant');
    const revisions: unknown[] = [];
    let siteRow = { id: siteId, tenantId, currentRevisionId: 'rev-old', themeId: 'rose' };
    const db: any = {
      // fetchRevision(expectedVersion) — save() читает базу перед записью
      // не обязан, но readPointer/fetchData порта могут понадобиться другим
      // веткам; здесь используется только вставка + один UPDATE.
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      transaction: async (cb: (tx: unknown) => Promise<void>) => {
        const staged: unknown[] = [];
        const tx = {
          insert: (_tbl: unknown) => ({
            values: async (value: unknown) => {
              staged.push(value);
            },
          }),
          update: (_tbl: unknown) => ({
            set: (_patch: unknown) => ({
              where: () => ({
                returning: async () => {
                  // Имитация обрыва (сеть/процесс) ровно между вставкой
                  // ревизии и сдвигом указателя+sitePatch — то самое «сбой
                  // между вставкой и обновлением магазина» из брифа R2.
                  throw new Error('simulated crash between insert and site update');
                },
              }),
            }),
          }),
        };
        await cb(tx);
        // Не должно достигаться: cb выше всегда бросает.
        revisions.push(...staged);
      },
    };
    const adapter = new DocumentAdapter(db);

    await expect(
      adapter.save(siteId, {
        mode: 'blind',
        document: { pages: [] },
        filterSeeded: false,
        tenantId,
        setCurrent: true,
        expectedVersion: 'rev-old',
        sitePatch: { themeId: 'flux' },
        site: { themeId: 'rose', publicUrl: null, currentRevisionId: siteRow.currentRevisionId },
      }),
    ).rejects.toThrow('simulated crash between insert and site update');

    // Ни новой ревизии (транзакция откатила вставку — staged не попал в revisions)…
    expect(revisions).toEqual([]);
    // …ни новой темы (сама строка site — та же ссылка, её никто не менял).
    expect(siteRow.themeId).toBe('rose');
    expect(siteRow.currentRevisionId).toBe('rev-old');
  });

  // R3 (`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`): история —
  // новые сверху, курсор постраничности, конверт → HistoryItem (И5: actor/
  // source/changes/restoredFrom из meta). Фейк не разбирает WHERE сам (это
  // делают настоящие операторы drizzle в revision-kinds.ts/document.
  // adapter.ts — снимки клиента без колонки kind уже проверяет
  // revision-save-merge.spec.ts) — здесь проверяется форма ответа.
  it('history(): новые сверху, курсор nextBefore, meta мапится в HistoryItem', async () => {
    const siteId = nextId('site');
    const rows = [
      {
        id: 'r1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        meta: {
          actor: 'merchant',
          source: 'constructor',
          changes: ['page:home/block:Hero-1/props/heading/text'],
        },
      },
      {
        id: 'r2',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        meta: { actor: 'merchant', source: 'rollback', restoredFrom: 'r1' },
      },
    ];
    let capturedWhere: unknown;
    const db: any = {
      select: (_proj?: unknown) => ({
        from: (_tbl: unknown) => ({
          where: (cond: unknown) => {
            capturedWhere = cond;
            return {
              orderBy: (..._cols: unknown[]) => ({
                limit: async (n: number) =>
                  [...rows]
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, n),
              }),
            };
          },
        }),
      }),
    };
    const adapter = new DocumentAdapter(db);
    const site = { themeId: 'rose', publicUrl: null, currentRevisionId: null };

    // limit шире, чем есть строк, — страница неполная, nextBefore пуст
    // (случай «ровно limit строк, может быть, есть ещё» — тест ниже).
    const page = await adapter.history(siteId, { site, limit: 5 });

    expect(page.items.map((i) => i.id)).toEqual(['r2', 'r1']);
    expect(page.nextBefore).toBeNull();
    expect(page.items[0]).toMatchObject({
      id: 'r2',
      actor: 'merchant',
      source: 'rollback',
      restoredFrom: 'r1',
      changes: null,
    });
    expect(page.items[1]).toMatchObject({
      id: 'r1',
      actor: 'merchant',
      source: 'constructor',
      changes: ['page:home/block:Hero-1/props/heading/text'],
      restoredFrom: null,
    });

    // Курсор `before` — пара (createdAt, id), не голая дата: свежий вызов действительно строит условие "раньше пары", а не
    // молча её игнорирует.
    const cursor = { createdAt: new Date('2026-01-02T00:00:00.000Z'), id: 'r2' };
    await adapter.history(siteId, { site, limit: 1, before: cursor });
    expect(sqlOf(capturedWhere)).toContain('"site_revision"."created_at" <');
    expect(sqlOf(capturedWhere)).toContain('"site_revision"."id" <');
    // drizzle сериализует Date в параметре как ISO-строку; курсор входит и в
    // lt(createdAt), и в eq(createdAt) (тай-брейк по id на совпавшую дату).
    const params = paramsOf(capturedWhere);
    expect(params).toContainEqual(cursor.createdAt.toISOString());
    expect(params).toContainEqual(cursor.id);
  });

  // nextBefore = (createdAt, id) последней строки страницы — ровно когда
  // страница полна (rows.length === limit): дальше могут быть ещё версии.
  it('history(): nextBefore есть, когда строк ровно limit', async () => {
    const siteId = nextId('site');
    const rows = [
      { id: 'r1', createdAt: new Date('2026-01-01T00:00:00.000Z'), meta: {} },
      { id: 'r2', createdAt: new Date('2026-01-02T00:00:00.000Z'), meta: {} },
    ];
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async (n: number) =>
                [...rows]
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .slice(0, n),
            }),
          }),
        }),
      }),
    };
    const adapter = new DocumentAdapter(db);
    const site = { themeId: 'rose', publicUrl: null, currentRevisionId: null };

    const page = await adapter.history(siteId, { site, limit: 1 });
    expect(page.items.map((i) => i.id)).toEqual(['r2']);
    expect(page.nextBefore).toEqual({ createdAt: rows[1].createdAt, id: rows[1].id });
  });

  // Курсор ТОЛЬКО по дате пропускал бы
  // версии на границе страницы, если у них совпал createdAt (та же
  // миллисекунда) — пара (createdAt, id) с keyset-фильтром по настоящему
  // WHERE (через sqlOf/paramsOf, а не ручную имитацию) обе версии находит.
  it('history(): две версии с одинаковым createdAt на границе страницы — обе попадают, ни одна не повторяется', async () => {
    const siteId = nextId('site');
    const T = new Date('2026-01-01T00:00:00.000Z');
    const rows = [
      { id: 'r-a', createdAt: T, meta: {} },
      { id: 'r-b', createdAt: T, meta: {} }, // та же миллисекунда, что r-a
      { id: 'r-c', createdAt: new Date('2025-12-31T00:00:00.000Z'), meta: {} },
    ];
    const ordered = [...rows].sort((x, y) => {
      const byTime = y.createdAt.getTime() - x.createdAt.getTime();
      return byTime !== 0 ? byTime : y.id.localeCompare(x.id); // id DESC — тай-брейк
    });
    const db: any = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            const sql = sqlOf(cond);
            const params = paramsOf(cond);
            const hasCursor = sql.includes('"site_revision"."created_at" <');
            const visible = !hasCursor
              ? ordered
              : ordered.filter((r) => {
                  const cursorCreatedAt = params[params.length - 2] as string;
                  const cursorId = params[params.length - 1] as string;
                  const t = r.createdAt.toISOString();
                  return t < cursorCreatedAt || (t === cursorCreatedAt && r.id < cursorId);
                });
            return {
              orderBy: () => ({ limit: async (n: number) => visible.slice(0, n) }),
            };
          },
        }),
      }),
    };
    const adapter = new DocumentAdapter(db);
    const site = { themeId: 'rose', publicUrl: null, currentRevisionId: null };

    const page1 = await adapter.history(siteId, { site, limit: 2 });
    expect(page1.items.map((i) => i.id)).toEqual(['r-b', 'r-a']);
    expect(page1.nextBefore).toEqual({ createdAt: T, id: 'r-a' });

    const page2 = await adapter.history(siteId, { site, limit: 2, before: page1.nextBefore! });
    expect(page2.items.map((i) => i.id)).toEqual(['r-c']);
    expect(page2.nextBefore).toBeNull();

    const seenAcrossPages = [...page1.items, ...page2.items].map((i) => i.id).sort();
    expect(seenAcrossPages).toEqual(['r-a', 'r-b', 'r-c']);
  });

  // envelopeOrNull() — дешёвая проверка «есть ли такая
  // ревизия» без содержимого; в отличие от get()/load(), отсутствие — не
  // исключение (суффикс OrNull, см. store-content.port.ts).
  it('envelopeOrNull(): конверт без data; нет такой ревизии — null, не исключение', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    store.revisions.set('rev-1', {
      id: 'rev-1',
      siteId,
      data: { pages: ['должно остаться недоступным вызывающему'] },
      meta: { actor: 'merchant' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: 'u1',
    });
    const adapter = new DocumentAdapter(store.db);
    const opts = { site: { themeId: 'rose', publicUrl: null, currentRevisionId: null } };

    // makeFakeDb не разбирает проекцию .select({...}) (всегда отдаёт всю
    // сохранённую строку) — сама проекция (envelope без .data) проверена в
    // document.adapter.ts (см. get(): envelopeOrNull() + отдельный load() за
    // содержимым, а не двойное чтение блоба). Здесь — форма ответа и
    // поведение на отсутствующую ревизию.
    const envelope = await adapter.envelopeOrNull(siteId, 'rev-1', opts);
    expect(envelope).toMatchObject({
      id: 'rev-1',
      siteId,
      meta: { actor: 'merchant' },
      createdBy: 'u1',
    });

    const missing = await adapter.envelopeOrNull(siteId, 'rev-does-not-exist', opts);
    expect(missing).toBeNull();
  });

  // load() бросает RevisionNotFoundError
  // (не голую строку) — вызывающий код различает «ревизии нет» от сбоя базы
  // через instanceof, не хрупкое сравнение e.message.
  it('load(): «ревизии нет» бросает именно RevisionNotFoundError (instanceof, не просто Error)', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    const adapter = new DocumentAdapter(store.db);
    const opts = { site: { themeId: 'rose', publicUrl: null, currentRevisionId: null } };

    await expect(adapter.load(siteId, { revisionId: 'rev-does-not-exist', site: opts.site })).rejects.toThrow(
      RevisionNotFoundError,
    );
  });

  // loadOrNull() — как load(), но
  // «ревизии нет» отдаёт null; ЛЮБАЯ другая ошибка (сбой базы) пробрасывается
  // как есть — этим он отличается от старого голого `.catch(() => null)`,
  // который гасил и сбой базы (см. no-swallowed-db-errors.spec.ts — саботаж).
  it('loadOrNull(): «ревизии нет» — null; содержимое — как у load()', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    store.revisions.set('rev-1', {
      id: 'rev-1',
      siteId,
      data: { pages: ['content'] },
      meta: {},
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
    });
    const adapter = new DocumentAdapter(store.db);
    const opts = { site: { themeId: 'rose', publicUrl: null, currentRevisionId: null } };

    const missing = await adapter.loadOrNull(siteId, { revisionId: 'rev-does-not-exist', site: opts.site });
    expect(missing).toBeNull();

    const found = await adapter.loadOrNull(siteId, { revisionId: 'rev-1', site: opts.site, asStored: true });
    expect(found).toMatchObject({ document: { pages: ['content'] }, version: 'rev-1' });
  });

  it('loadOrNull(): сбой базы (не «ревизии нет») пробрасывается, не гасится в null', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    const adapter = new DocumentAdapter(store.db);
    const opts = { site: { themeId: 'rose', publicUrl: null, currentRevisionId: null } };
    const dbFailure = new Error('connection terminated unexpectedly');
    jest.spyOn(store.db, 'select').mockImplementationOnce(() => {
      throw dbFailure;
    });

    await expect(
      adapter.loadOrNull(siteId, { revisionId: 'rev-1', site: opts.site }),
    ).rejects.toThrow('connection terminated unexpectedly');
  });

  // historyCounts() — число версий (без снимков клиента)
  // ПАЧКОЙ сайтов одним запросом (admin/bulk экспорт).
  it('historyCounts(): считает версии на сайт пачкой, снимки клиента не считает, пустой сайт — 0', async () => {
    const [siteA, siteB, siteC] = [nextId('site'), nextId('site'), nextId('site')];
    const rows = [
      { siteId: siteA, kind: null as string | null },
      { siteId: siteA, kind: null as string | null },
      { siteId: siteA, kind: 'client-snapshot' }, // не считается
      { siteId: siteB, kind: null as string | null },
      // siteC — вообще нет ревизий
    ];
    const db: any = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            const params = paramsOf(cond);
            // inArray(siteId, [...]) разворачивается в ОТДЕЛЬНЫЙ параметр на
            // каждый id (проверено эмпирически: "in ($1, $2, $3)"), последний
            // параметр — литерал isStoreVersion() ('client-snapshot').
            const ids = params.slice(0, -1) as string[];
            const visible = rows.filter(
              (r) => ids.includes(r.siteId) && r.kind !== 'client-snapshot',
            );
            return {
              groupBy: () => {
                const counts = new Map<string, number>();
                for (const r of visible) counts.set(r.siteId, (counts.get(r.siteId) ?? 0) + 1);
                return Promise.resolve(
                  [...counts.entries()].map(([siteId, count]) => ({ siteId, count })),
                );
              },
            };
          },
        }),
      }),
    };
    const adapter = new DocumentAdapter(db);

    const counts = await adapter.historyCounts([siteA, siteB, siteC]);
    expect(counts.get(siteA)).toBe(2);
    expect(counts.get(siteB)).toBe(1);
    expect(counts.get(siteC) ?? 0).toBe(0);

    expect(await adapter.historyCounts([])).toEqual(new Map());
  });

  it('diff(): читает from/to тем же путём, что load, и строит операции движка', async () => {
    const siteId = nextId('site');
    const site = { id: siteId, tenantId: nextId('tenant'), currentRevisionId: null as string | null };
    const store = makeFakeDb(site);
    store.revisions.set('rev-a', {
      id: 'rev-a',
      siteId,
      data: { pages: [], pagesData: {}, themeSettings: { title: 'A' } },
      meta: {},
      createdAt: new Date(0),
    });
    store.revisions.set('rev-b', {
      id: 'rev-b',
      siteId,
      data: { pages: [], pagesData: {}, themeSettings: { title: 'B' } },
      meta: {},
      createdAt: new Date(0),
    });
    const adapter = new DocumentAdapter(store.db);

    const result = await adapter.diff(siteId, 'rev-a', 'rev-b', {
      site: { themeId: 'rose', publicUrl: null, currentRevisionId: null },
    });

    expect(result.ops).toEqual([
      { op: 'set', path: 'themeSettings/title', value: 'B' },
    ]);
  });
});
