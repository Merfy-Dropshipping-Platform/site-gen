/**
 * Unit tests for PagesService.deletePage — system-page deletion guard.
 *
 * Regression coverage for the live data-loss bug: legacy revisions
 * (manifestVersion absent, pages WITHOUT a `role` field) bypassed the
 * `target.role === 'system'` guard, so `DELETE .../pages/home` deleted the
 * home system page. The guard must instead derive the protected set from the
 * theme manifest (via the resolver), NOT from the raw/normalized `role`.
 *
 * The Drizzle `db` is hand-mocked: `deletePage` issues two reads
 * (`select().from(site)`, `select().from(siteRevision)`) and one write
 * (`update().set().where()`). The mock routes reads by table identity and
 * captures the write payload for assertions.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PagesService } from '../pages/pages.service';
import * as schema from '../db/schema';

type RevData = Record<string, any>;

/**
 * Minimal Drizzle stub. Supports:
 *   db.select().from(<table>).where(...)  → resolves to row array
 *   db.update(<table>).set(<data>).where(...) → records data into capture box
 */
function makeDb(opts: {
  site: any | null;
  rev: any | null;
  captured: { data?: RevData };
}) {
  const { site, rev, captured } = opts;
  return {
    select() {
      return {
        from(table: any) {
          let rows: any[] = [];
          if (table === schema.site) rows = site ? [site] : [];
          else if (table === schema.siteRevision) rows = rev ? [rev] : [];
          // The query is awaited after `.where(...)`; make the chain thenable.
          const result = {
            where() {
              return Promise.resolve(rows);
            },
          };
          return result;
        },
      };
    },
    update(_table: any) {
      return {
        // deletePage calls `.set({ data: newRevData })` — unwrap the Drizzle
        // column wrapper so assertions read the revision payload directly.
        set(cols: { data: RevData }) {
          captured.data = cols.data;
          return {
            where() {
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  } as any;
}

const SITE_ID = 'site-1';
const TENANT_ID = 'tenant-1';
const REV_ID = 'rev-1';

function makeSite(overrides: Partial<any> = {}) {
  return {
    id: SITE_ID,
    tenantId: TENANT_ID,
    themeId: 'rose',
    currentRevisionId: REV_ID,
    ...overrides,
  };
}

function makeRev(data: RevData) {
  return { id: REV_ID, data };
}

describe('PagesService.deletePage — system-page guard', () => {
  it('REGRESSION: legacy revision (no role on pages) — deleting "home" THROWS cannot_delete_system_page', async () => {
    // Legacy shape: manifestVersion absent, pages have NO `role` field.
    const legacyData: RevData = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/' },
        { id: 'page-about', name: 'О нас', slug: '/about' },
      ],
      pagesData: {
        home: { content: [], root: { props: {} }, zones: {} },
        'page-about': { content: [], root: { props: {} }, zones: {} },
      },
    };
    const captured: { data?: RevData } = {};
    const db = makeDb({ site: makeSite({ themeId: 'rose' }), rev: makeRev(legacyData), captured });
    const service = new PagesService(db);

    await expect(
      service.deletePage({ tenantId: TENANT_ID, siteId: SITE_ID, pageId: 'home' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // No write should have happened.
    expect(captured.data).toBeUndefined();
  });

  it('legacy custom page (id "custom-page-123", isCustom:true, no role) stays DELETABLE', async () => {
    const legacyData: RevData = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/' },
        { id: 'custom-page-123', name: 'Моя страница', slug: '/my', isCustom: true },
      ],
      pagesData: {
        home: { content: [], root: { props: {} }, zones: {} },
        'custom-page-123': { content: [], root: { props: {} }, zones: {} },
      },
      lockVersion: 3,
    };
    const captured: { data?: RevData } = {};
    const db = makeDb({ site: makeSite({ themeId: 'rose' }), rev: makeRev(legacyData), captured });
    const service = new PagesService(db);

    const res = await service.deletePage({
      tenantId: TENANT_ID,
      siteId: SITE_ID,
      pageId: 'custom-page-123',
    });

    expect(res).toEqual({ deleted: 'custom-page-123' });
    expect(captured.data).toBeDefined();
    // Page removed from pages + pagesData; lockVersion bumped.
    expect(captured.data!.pages.map((p: any) => p.id)).toEqual(['home']);
    expect(captured.data!.pagesData['custom-page-123']).toBeUndefined();
    expect(captured.data!.lockVersion).toBe(4);
  });

  it('normalized custom page (role:"custom") is DELETABLE', async () => {
    const data: RevData = {
      manifestVersion: '2.0',
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system' },
        { id: 'page-custom-xyz', name: 'Custom', slug: '/xyz', role: 'custom', isCustom: true },
      ],
      pagesData: {
        home: { content: [], root: { props: {} }, zones: {} },
        'page-custom-xyz': { content: [], root: { props: {} }, zones: {} },
      },
    };
    const captured: { data?: RevData } = {};
    const db = makeDb({ site: makeSite({ themeId: 'rose' }), rev: makeRev(data), captured });
    const service = new PagesService(db);

    const res = await service.deletePage({
      tenantId: TENANT_ID,
      siteId: SITE_ID,
      pageId: 'page-custom-xyz',
    });

    expect(res).toEqual({ deleted: 'page-custom-xyz' });
    expect(captured.data!.pages.map((p: any) => p.id)).toEqual(['home']);
  });

  it('unknown pageId → NotFoundException (page_not_found)', async () => {
    const data: RevData = {
      pages: [{ id: 'home', name: 'Главная', slug: '/' }],
      pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    };
    const captured: { data?: RevData } = {};
    const db = makeDb({ site: makeSite(), rev: makeRev(data), captured });
    const service = new PagesService(db);

    await expect(
      service.deletePage({ tenantId: TENANT_ID, siteId: SITE_ID, pageId: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
