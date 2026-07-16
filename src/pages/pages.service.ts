/**
 * PagesService — CRUD над revision.data.pages (custom user pages).
 *
 * Хранит пользовательские страницы внутри `siteRevision.data`:
 * - `pages: Page[]` — массив метаданных страниц
 * - `pagesData: Record<pageId, PuckContent>` — содержимое каждой страницы
 *
 * Системные страницы (role: 'system') защищены от удаления.
 * Slug'и кастомных страниц не должны коллидировать с manifest.pages темы.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import * as crypto from "crypto";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { getPageResolver } from "../themes/page-resolver-instance";
import { getThemeManifest } from "../themes/theme-manifest-loader";

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createPage(params: {
    tenantId: string;
    siteId: string;
    name: string;
    slug: string;
    templatePageId?: string;
  }) {
    const [site] = await this.db
      .select()
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );
    if (!site) throw new NotFoundException("site_not_found");

    const [rev] = await this.db
      .select()
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId!));
    if (!rev) throw new NotFoundException("revision_not_found");

    const revData = rev.data as Record<string, any>;
    const pages = Array.isArray(revData.pages) ? revData.pages : [];
    const pagesData = revData.pagesData ?? {};

    if (pages.some((p: any) => p.slug === params.slug)) {
      throw new BadRequestException("slug_already_in_use");
    }

    // Block slug collisions с manifest.pages slugs
    if (site.themeId) {
      try {
        const resolver = getPageResolver(site.themeId);
        const normalized = resolver.normalizeRevision(revData);
        const manifestSlugs = new Set(
          normalized.pages
            .filter((p: any) => p.role === "system")
            .map((p: any) => p.slug),
        );
        if (manifestSlugs.has(params.slug)) {
          throw new BadRequestException("slug_collides_with_system_page");
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // resolver unavailable — skip system slug check
      }
    }

    const newId = `page-custom-${crypto.randomUUID()}`;
    const newPage = {
      id: newId,
      name: params.name,
      slug: params.slug,
      role: "custom" as const,
      isCustom: true,
      source: "user" as const,
      createdAt: Date.now(),
      seo: null,
      locale: null,
      variant: null,
      schedule: null,
      permissions: null,
      targeting: null,
    };

    let newContent: any;
    if (params.templatePageId && pagesData[params.templatePageId]) {
      // clone template — deep copy
      newContent = JSON.parse(JSON.stringify(pagesData[params.templatePageId]));
    } else {
      // minimal: Header + контент-секция «Страница» + Footer (theme defaults).
      // Page в свободном режиме (pageId="") — редактируемая секция-плейсхолдер,
      // чтобы новая страница не была пустой между шапкой и подвалом. Зеркалит
      // фронтовый createEmptyPageData в конструкторе (ConstructorContext.tsx) —
      // оба источника дефолта должны совпадать, иначе reload до сохранения
      // покажет иную структуру.
      newContent = {
        content: [
          { type: "Header", props: { id: `Header-${newId}` } },
          {
            type: "Page",
            props: {
              id: `Page-${newId}`,
              pageId: "",
              headingSize: "medium",
              colorScheme: "scheme-1",
              padding: { top: 80, bottom: 80 },
            },
          },
          { type: "Footer", props: { id: `Footer-${newId}` } },
        ],
        root: { props: { title: params.name } },
        zones: {},
      };
    }

    const newRevData = {
      ...revData,
      pages: [...pages, newPage],
      pagesData: { ...pagesData, [newId]: newContent },
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };

    await this.db
      .update(schema.siteRevision)
      .set({ data: newRevData })
      .where(eq(schema.siteRevision.id, rev.id));

    return { page: newPage };
  }

  async deletePage(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
  }) {
    const [site] = await this.db
      .select()
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );
    if (!site) throw new NotFoundException("site_not_found");

    const [rev] = await this.db
      .select()
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId!));
    if (!rev) throw new NotFoundException("revision_not_found");

    const revData = rev.data as Record<string, any>;
    const pages = Array.isArray(revData.pages) ? revData.pages : [];
    const target = pages.find((p: any) => p.id === params.pageId);
    if (!target) throw new NotFoundException("page_not_found");

    // Authoritative system-page set = the theme manifest's system pages.
    // Raw `role` is absent on legacy revisions; normalized `role` over-protects
    // (migration defaults missing role to 'system'). So check manifest membership.
    let isSystemPage = target.role === "system"; // fallback if resolver unavailable
    if (site.themeId) {
      try {
        const resolver = getPageResolver(site.themeId);
        // normalizeRevision on an empty revision yields exactly the manifest pages
        // (metadata only, no content load) with their true roles.
        const systemIds = new Set(
          resolver
            .normalizeRevision({ pages: [], pagesData: {} })
            .pages.filter((p: any) => p.role === "system")
            .map((p: any) => p.id),
        );
        isSystemPage = systemIds.has(params.pageId);
      } catch (e) {
        // resolver unavailable — fall back to raw role check
      }
    }
    if (isSystemPage)
      throw new ForbiddenException("cannot_delete_system_page");

    const newPages = pages.filter((p: any) => p.id !== params.pageId);
    const newPagesData = { ...revData.pagesData };
    delete newPagesData[params.pageId];

    const newRevData = {
      ...revData,
      pages: newPages,
      pagesData: newPagesData,
      currentPageId:
        revData.currentPageId === params.pageId
          ? "home"
          : revData.currentPageId,
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };

    await this.db
      .update(schema.siteRevision)
      .set({ data: newRevData })
      .where(eq(schema.siteRevision.id, rev.id));

    return { deleted: params.pageId };
  }

  /**
   * updatePage — редактирование метаданных существующей страницы (SEO + опц. name).
   * RMW-зеркало deletePage: site (scope tenant) → current revision → найти страницу
   * в revData.pages → deep-merge seo по ключам (частичный сейв поля не теряет
   * соседние) → lockVersion+1 → update. Create/delete — вне scope. Доставка в live
   * <head> — на следующей публикации сайта (revision-изменение, как у create/delete),
   * через injectCustomPagesSeo. Гейта на role==='system' НЕТ: редактировать seo
   * любой страницы легально, но инжектор системные пропускает (home = branding.seo).
   */
  async updatePage(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
    seo?: { title?: string; description?: string; keywords?: string };
    name?: string;
  }) {
    const [site] = await this.db
      .select()
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );
    if (!site) throw new NotFoundException("site_not_found");

    const [rev] = await this.db
      .select()
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId!));
    if (!rev) throw new NotFoundException("revision_not_found");

    const revData = rev.data as Record<string, any>;
    const pages = Array.isArray(revData.pages) ? revData.pages : [];
    const idx = pages.findIndex((p: any) => p.id === params.pageId);
    if (idx === -1) throw new NotFoundException("page_not_found");

    const target = pages[idx];
    const nextPage = { ...target };
    if (params.seo !== undefined) {
      nextPage.seo = { ...(target.seo ?? {}), ...params.seo };
    }
    if (typeof params.name === "string" && params.name.trim()) {
      nextPage.name = params.name.trim();
    }

    const newPages = [...pages];
    newPages[idx] = nextPage;
    const newRevData = {
      ...revData,
      pages: newPages,
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };

    await this.db
      .update(schema.siteRevision)
      .set({ data: newRevData })
      .where(eq(schema.siteRevision.id, rev.id));

    return { page: nextPage };
  }

  /**
   * listPages — лёгкий листинг метаданных страниц сайта (БЕЗ pagesData).
   *
   * Оптимизация относительно тяжёлого GET /sites/:id/revisions/:revisionId,
   * который тянет весь Puck-контент. Читаем current revision, нормализуем ТЕМ
   * ЖЕ resolver-путём, что deletePage (гарантирует role/isCustom/slug на каждой
   * странице, включая legacy-ревизии без `role`), и возвращаем только
   * метаданные. `revision.data.pagesData` в ответ не попадает — в этом суть
   * оптимизации.
   */
  async listPages(params: { tenantId: string; siteId: string }) {
    const [site] = await this.db
      .select()
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );
    if (!site) throw new NotFoundException("site_not_found");

    // Свежий сайт без ревизии → страниц ещё нет. Для read-роута отдаём пустой
    // список (терпимость к отсутствию данных — как в page-meta.controller),
    // а не 404.
    if (!site.currentRevisionId) return { pages: [] };

    const [rev] = await this.db
      .select()
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId));
    if (!rev) return { pages: [] };

    const revData = rev.data as Record<string, any>;
    let pages: any[] = Array.isArray(revData.pages) ? revData.pages : [];

    // Нормализуем тем же resolver-путём, что deletePage — гарантирует
    // role/isCustom/slug на каждой странице (legacy-ревизии без `role`).
    // pagesData из нормализованного результата НЕ используем.
    if (site.themeId) {
      try {
        const resolver = getPageResolver(site.themeId);
        pages = resolver.normalizeRevision(revData).pages;
      } catch (e) {
        // resolver недоступен — отдаём сырые pages как есть
      }
    }

    // Определяем home-страницу по манифесту темы (та же логика, что
    // buildInitialRevision: страница с isHome, иначе первая), с фолбэком на
    // slug '/' — чистого home-маркера на RevisionPage нет. Манифест
    // resolveJsonModule-инлайнится: обращение суб-миллисекундное. TS-интерфейс
    // ThemeManifest не декларирует `pages`, но рантайм-JSON их содержит.
    let homePageId: string | null = null;
    if (site.themeId) {
      const manifest = getThemeManifest(site.themeId) as
        | { pages?: Array<{ id?: string; isHome?: boolean }> }
        | null;
      const manifestPages = manifest?.pages ?? [];
      const homeEntry =
        manifestPages.find((p) => p?.isHome) ?? manifestPages[0];
      homePageId =
        homeEntry && typeof homeEntry.id === "string" ? homeEntry.id : null;
    }

    return {
      pages: pages.map((p: any) => {
        const slug = typeof p.slug === "string" ? p.slug : "";
        // isHome: authoritative match is the manifest home id; slug '/' is the
        // canonical home slug (always trusted). The legacy "home" string
        // fallbacks are merchant-controllable (a custom page could use slug
        // "home" / id "home"), so gate them to the unknown-manifest case only —
        // otherwise a custom "home"-slugged page would falsely collapse to '/'.
        const isHome =
          (homePageId != null && p.id === homePageId) ||
          slug === "/" ||
          (homePageId == null && (slug === "home" || p.id === "home"));
        // path: home → '/', иначе slug как есть (если с ведущим '/') либо
        // '/'+slug. Зеркалит page-meta.controller.
        const path = isHome
          ? "/"
          : slug.startsWith("/")
            ? slug
            : slug
              ? `/${slug}`
              : "/";
        return {
          id: p.id,
          name: typeof p.name === "string" ? p.name : "",
          slug,
          role:
            p.role === "custom" ? ("custom" as const) : ("system" as const),
          isCustom: p.role === "custom" || Boolean(p.isCustom),
          isHome,
          path,
          // seo — чтобы редактор гидратировался текущими значениями (иначе пустой
          // редактор затрёт сохранённое). null если не задано.
          seo: (p.seo ?? null) as {
            title?: string;
            description?: string;
            keywords?: string;
          } | null,
        };
      }),
    };
  }
}
