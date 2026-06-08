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
      // minimal: Header + Footer from theme defaults
      newContent = {
        content: [
          { type: "Header", props: { id: `Header-${newId}` } },
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
}
