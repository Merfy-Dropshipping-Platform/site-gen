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
    tenantId,
    contentModel: 'document',
    get currentRevisionId() {
      return site.currentRevisionId;
    },
  };

  return {
    content,
    siteId,
    site: siteContext,
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
      document: { pages: [] },
      filterSeeded: false,
      site: { themeId: 'rose', publicUrl: null, tenantId: site.tenantId, currentRevisionId: site.currentRevisionId },
    });

    expect(store.countStoredRevisions()).toBe(2);
    expect(site.currentRevisionId).toBe('rev-old');
    expect(result.version).not.toBe('rev-old');
  });
});
