/**
 * Unit tests for PagesService.listPages — lightweight page-metadata listing.
 *
 * Contract (mirrored by api-gateway GET /sites/:id/pages):
 *   { pages: [ { id, name, slug, role, isCustom, isHome, path } ] }
 * The response is metadata-only — `revision.data.pagesData` (Puck content)
 * must never leak into any returned page object.
 *
 * The Drizzle `db` is hand-mocked (same technique as pages-service-delete.spec):
 * `listPages` issues two reads (`select().from(site)`, `select().from(siteRevision)`)
 * and NO write. The mock routes reads by table identity.
 */
import { NotFoundException } from '@nestjs/common';
import { PagesService } from '../pages/pages.service';
import * as schema from '../db/schema';

type RevData = Record<string, any>;

/** Minimal Drizzle stub — read-only: select().from(<table>).where(...) → rows. */
function makeDb(opts: { site: any | null; rev: any | null }) {
  const { site, rev } = opts;
  return {
    select() {
      return {
        from(table: any) {
          let rows: any[] = [];
          if (table === schema.site) rows = site ? [site] : [];
          else if (table === schema.siteRevision) rows = rev ? [rev] : [];
          return {
            where() {
              return Promise.resolve(rows);
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

const CONTRACT_KEYS = [
  'id',
  'isCustom',
  'isHome',
  'name',
  'path',
  'role',
  'slug',
  // seo + content отдаются для гидратации редактора «Страницы» (значения полей,
  // НЕ полный pagesData). content — тело секции «Страница» (короткое «Описание»).
  'seo',
  'content',
].sort();

function makeSite(overrides: Partial<any> = {}) {
  return {
    id: SITE_ID,
    tenantId: TENANT_ID,
    // Unknown theme → getPageResolver throws → raw pages used verbatim,
    // giving deterministic mapping assertions (no manifest injection).
    themeId: 'unknown-theme',
    currentRevisionId: REV_ID,
    ...overrides,
  };
}

function makeRev(data: RevData) {
  return { id: REV_ID, data };
}

describe('PagesService.listPages — metadata-only listing', () => {
  it('maps pages to the contract shape; derives isHome + path; drops pagesData', async () => {
    const data: RevData = {
      pages: [
        { id: 'home', name: 'Главная', slug: '/', role: 'system', isCustom: false },
        {
          id: 'page-custom-1',
          name: 'Промо',
          slug: '/promo',
          role: 'custom',
          isCustom: true,
        },
        // slug without leading slash → path gets a '/' prefix
        {
          id: 'page-custom-2',
          name: 'Контакты',
          slug: 'contacts',
          role: 'custom',
          isCustom: true,
        },
      ],
      pagesData: {
        home: { content: [{ type: 'Header', props: {} }], root: { props: {} }, zones: {} },
        'page-custom-1': { content: [], root: { props: {} }, zones: {} },
        'page-custom-2': { content: [], root: { props: {} }, zones: {} },
      },
    };
    const db = makeDb({ site: makeSite(), rev: makeRev(data) });
    const service = new PagesService(db);

    const res = await service.listPages({ tenantId: TENANT_ID, siteId: SITE_ID });

    expect(res.pages).toEqual([
      {
        id: 'home',
        name: 'Главная',
        slug: '/',
        role: 'system',
        isCustom: false,
        isHome: true,
        path: '/',
        seo: null,
        content: '',
      },
      {
        id: 'page-custom-1',
        name: 'Промо',
        slug: '/promo',
        role: 'custom',
        isCustom: true,
        isHome: false,
        path: '/promo',
        seo: null,
        content: '',
      },
      {
        id: 'page-custom-2',
        name: 'Контакты',
        slug: 'contacts',
        role: 'custom',
        isCustom: true,
        isHome: false,
        path: '/contacts',
        seo: null,
        content: '',
      },
    ]);

    // Контракт-ключи: метаданные + seo/content для гидратации редактора, но НЕ
    // полный pagesData (в этом суть лёгкого листинга).
    for (const p of res.pages) {
      expect(Object.keys(p).sort()).toEqual(CONTRACT_KEYS);
      expect(p).not.toHaveProperty('pagesData');
    }
  });

  it('чинит аномалию role:system+isCustom:true → единый предикат делает страницу role:custom (её можно удалить в редакторе)', async () => {
    const data: RevData = {
      // Реальный прод-кейс «тест»: кастомная страница, чей сохранённый role ≠
      // 'custom' (потерян/нормализован в 'system'), но isCustom:true. listPages
      // обязан вернуть role:'custom', иначе фронт-гейт role!=='system' не даст
      // её выделить/удалить (хотя deletePage её удаляет — нет в манифесте).
      pages: [
        { id: 'page-custom-test', name: 'тест', slug: '/test', role: 'system', isCustom: true },
      ],
      pagesData: {
        'page-custom-test': { content: [], root: { props: {} }, zones: {} },
      },
    };
    const db = makeDb({ site: makeSite(), rev: makeRev(data) });
    const service = new PagesService(db);

    const res = await service.listPages({ tenantId: TENANT_ID, siteId: SITE_ID });

    const page = res.pages.find((p) => p.id === 'page-custom-test');
    expect(page).toBeDefined();
    expect(page!.isCustom).toBe(true);
    expect(page!.role).toBe('custom');
  });

  it('normalizes a legacy revision (no role) via the theme resolver — home stays system + isHome', async () => {
    // Real 'rose' theme → resolver.normalizeRevision guarantees role/isCustom/slug
    // and manifest home id, even though the raw rows lack `role`.
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
    const db = makeDb({ site: makeSite({ themeId: 'rose' }), rev: makeRev(legacyData) });
    const service = new PagesService(db);

    const res = await service.listPages({ tenantId: TENANT_ID, siteId: SITE_ID });

    expect(res.pages.length).toBeGreaterThan(0);
    const home = res.pages.find((p) => p.id === 'home');
    expect(home).toBeDefined();
    expect(home!.role).toBe('system');
    expect(home!.isHome).toBe(true);
    expect(home!.path).toBe('/');

    // Metadata-only: no heavy fields on any normalized entry.
    for (const p of res.pages) {
      expect(Object.keys(p).sort()).toEqual(CONTRACT_KEYS);
      expect(p).not.toHaveProperty('pagesData');
    }
  });

  it('site not found → NotFoundException', async () => {
    const db = makeDb({ site: null, rev: null });
    const service = new PagesService(db);

    await expect(
      service.listPages({ tenantId: TENANT_ID, siteId: SITE_ID }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('site without a current revision → empty pages list', async () => {
    const db = makeDb({ site: makeSite({ currentRevisionId: null }), rev: null });
    const service = new PagesService(db);

    const res = await service.listPages({ tenantId: TENANT_ID, siteId: SITE_ID });
    expect(res).toEqual({ pages: [] });
  });
});
