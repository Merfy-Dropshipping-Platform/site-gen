/**
 * PagesService — CRUD над revision.data.pages (custom user pages).
 *
 * Хранит пользовательские страницы внутри `siteRevision.data`:
 * - `pages: Page[]` — массив метаданных страниц
 * - `pagesData: Record<pageId, PuckContent>` — содержимое каждой страницы
 *
 * Системные страницы (role: 'system') защищены от удаления.
 * Slug'и кастомных страниц не должны коллидировать с manifest.pages темы.
 *
 * Запись (этап 2, И1): каждая правка — НОВАЯ ревизия через порт StoreContent
 * с базой = прочитанная ревизия (раньше — `UPDATE site_revision SET data` на
 * текущей строке без CAS, гонка с автосейвом конструктора). Правки в разных
 * местах сливаются портом; спор о том же месте — правка пересчитывается от
 * свежей ревизии (`rewriteCurrent`).
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Optional,
} from "@nestjs/common";
import * as crypto from "crypto";
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { getPageResolver } from "../themes/page-resolver-instance";
import { getThemeManifest } from "../themes/theme-manifest-loader";
import { emptyPageBlock } from "./page-section";
import {
  StoreContentService,
  resolveStoreContent,
} from "../content/store-content.service";
import { toStoreContentSite } from "../content/store-content.port";
import type { StoreContent } from "../content/store-content.port";
import { rewriteCurrent } from "../content/rewrite-current";
import {
  SPECIAL_PAGE_IDS,
  SPECIAL_PAGE_SLUGS,
  withSpecialPages,
} from "../content/new-theme-pages";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";

type SiteRow = typeof schema.site.$inferSelect;
type SiteScope = { tenantId: string; siteId: string };

/**
 * Извлекает тело («Описание») контент-страницы из её Puck-дерева: props.content
 * первой секции «Страница». Пусто, если секции/тела нет. Нужно для гидратации
 * редактора «Страницы» текущим содержимым (иначе пустой редактор затрёт сейв).
 */
function extractPageBodyContent(pageData: unknown): string {
  const content = (pageData as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return "";
  const pageBlock = content.find(
    (b: unknown) => (b as { type?: string })?.type === "Page",
  );
  const body = (pageBlock as { props?: { content?: unknown } } | undefined)
    ?.props?.content;
  return typeof body === "string" ? body : "";
}

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    // Этап 2 (И1): правки страниц — новая ревизия через порт StoreContent.
    // Optional — как в SitesDomainService: тесты, собирающие сервис напрямую,
    // получают DocumentAdapter на том же db.
    @Optional()
    private readonly injectedStoreContent?: StoreContentService,
    // Новая тема (блок 1 «Секций и SDK», часть 4): магазин на ней — у StorefrontHandoff (глобальный модуль блока 6);
    // секции, которые можно поставить на новую страницу, — у сборщика витрин (GET /sections).
    @Optional() private readonly handoff?: StorefrontHandoff,
    @Optional() private readonly builder?: StorefrontBuilderClient,
  ) {}

  private storeContentInstance?: StoreContent;

  private get storeContent(): StoreContent {
    return (this.storeContentInstance ??= resolveStoreContent(
      this.injectedStoreContent,
      this.db,
    ));
  }

  /**
   * Сайт (в пределах тенанта) и его текущая ревизия как она хранится — через
   * порт, без шагов чтения: основа правки и её база.
   */
  private async readCurrent(params: SiteScope) {
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

    const stored = await this.storeContent
      .load(site.id, { site: toStoreContentSite(site), asStored: true })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "revision_not_found") {
          throw new NotFoundException("revision_not_found");
        }
        throw e;
      });
    return {
      site,
      revisionId: stored.version,
      revData: stored.document as Record<string, any>,
    };
  }

  /**
   * Новая ревизия через порт (этап 2, И1): база — прочитанная ревизия. Чужие
   * правки в других местах сливаются; спор о том же месте — ошибка, и
   * `rewriteCurrent` пересчитывает правку от свежей ревизии.
   */
  private async saveRevision(
    tenantId: string,
    site: SiteRow,
    baseRevisionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.storeContent.save(site.id, {
      mode: "on-base",
      document: data,
      base: baseRevisionId,
      tenantId,
      actor: "merchant",
      source: "admin-pages",
      mergePolicy: "reject-conflicts",
      site: toStoreContentSite({ ...site, currentRevisionId: baseRevisionId }),
    });
  }

  async createPage(params: {
    tenantId: string;
    siteId: string;
    name: string;
    slug: string;
    templatePageId?: string;
  }) {
    return rewriteCurrent(() => this.createPageOnce(params));
  }

  private async createPageOnce(params: {
    tenantId: string;
    siteId: string;
    name: string;
    slug: string;
    templatePageId?: string;
  }) {
    const { site, revisionId, revData } = await this.readCurrent(params);
    if (await this.isNewTheme(site.id))
      return this.createNewThemePage(params, site, revisionId, revData);
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
    const newPage = customPageOf(newId, params.name, params.slug);

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
      // Шапку и подвал берём с главной: они общие для сайта, без клонирования
      // новая страница получала пустую шапку — без логотипа и без меню магазина.
      const homeContent =
        (
          pagesData["home"] as
            | { content?: Array<Record<string, any>> }
            | undefined
        )?.content ?? [];
      const homeHeader = homeContent.find((b) => b?.type === "Header");
      const homeFooter = homeContent.find((b) => b?.type === "Footer");
      newContent = {
        content: [
          homeHeader
            ? {
                ...homeHeader,
                props: { ...homeHeader.props, id: `Header-${newId}` },
              }
            : { type: "Header", props: { id: `Header-${newId}` } },
          emptyPageBlock(newId),
          homeFooter
            ? {
                ...homeFooter,
                props: { ...homeFooter.props, id: `Footer-${newId}` },
              }
            : { type: "Footer", props: { id: `Footer-${newId}` } },
        ],
        root: { props: { title: params.name } },
        zones: {},
      };
    }

    // Новая страница попадает в меню магазина. Без этого она рендерилась, но
    // ссылки на неё не было нигде — покупатель на неё не попадал, а добавить
    // пункт вручную можно только через модалку меню шапки. Шапка общая, поэтому
    // дописываем ссылку в navigationLinks каждой страницы. Идемпотентно по href.
    const withNavLink = (data: unknown): unknown => {
      const pageData = data as
        | { content?: Array<Record<string, any>> }
        | undefined;
      if (!pageData || !Array.isArray(pageData.content)) return data;
      let touched = false;
      const content = pageData.content.map((block) => {
        if (block?.type !== "Header") return block;
        const links: Array<{ href?: string }> = Array.isArray(
          block.props?.navigationLinks,
        )
          ? block.props.navigationLinks
          : [];
        if (links.some((l) => l?.href === newPage.slug)) return block;
        touched = true;
        return {
          ...block,
          props: {
            ...block.props,
            navigationLinks: [
              ...links,
              { href: newPage.slug, label: newPage.name },
            ],
          },
        };
      });
      return touched ? { ...pageData, content } : data;
    };

    const pagesDataWithNav: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pagesData)) {
      pagesDataWithNav[key] = withNavLink(value);
    }

    const newRevData = {
      ...revData,
      pages: [...pages, newPage],
      pagesData: { ...pagesDataWithNav, [newId]: withNavLink(newContent) },
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };

    await this.saveRevision(params.tenantId, site, revisionId, newRevData);

    return { page: newPage };
  }

  async deletePage(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
  }) {
    return rewriteCurrent(() => this.deletePageOnce(params));
  }

  private async deletePageOnce(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
  }) {
    const { site, revisionId, revData } = await this.readCurrent(params);
    if (await this.isNewTheme(site.id))
      return this.deleteNewThemePage(params, site, revisionId, revData);
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
    if (isSystemPage) throw new ForbiddenException("cannot_delete_system_page");

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

    await this.saveRevision(params.tenantId, site, revisionId, newRevData);

    return { deleted: params.pageId };
  }

  /**
   * updatePage — редактирование метаданных + тела существующей страницы
   * (SEO + опц. name + опц. content). RMW-зеркало deletePage: site (scope tenant) →
   * current revision → найти страницу в revData.pages → merge seo → name → тело
   * (content→секция «Страница» дерева pagesData[pageId]; heading=name) → lockVersion+1
   * → update. Create/delete — вне scope. Доставка в live: seo → <head>
   * (injectCustomPagesSeo) на следующей публикации; тело → секция «Страница» рендерит
   * heading/content на витрине. Тело правим только для страниц с секцией «Страница».
   */
  private async isNewTheme(siteId: string): Promise<boolean> {
    return (await this.handoff?.isNewTheme(siteId)) === true;
  }

  // ── Новая тема (блок 1 «Секций и SDK», часть 4, Р1-4-13) ──
  // Строка pages — та же, что у пяти тем; содержимое страницы — секции ревизии (ключ sections), не дерево Puck: пустое
  // дерево в pagesData — чтобы прежний код sites видел страницу. На новую страницу ставится секция с "newPage" из
  // списка секций магазина (сборщик, GET /sections), в её настройку пишется имя страницы; такой секции нет — секций
  // нет. Пункт страницы — в конец меню main (В1-4 А); меню нет — создаётся.
  private async createNewThemePage(
    params: { tenantId: string; name: string; slug: string },
    site: SiteRow,
    revisionId: string,
    revData: Record<string, any>,
  ) {
    if (!NEW_PAGE_SLUG.test(params.slug))
      throw new BadRequestException("slug_invalid");
    // Стенд темы и особые страницы платформы (блок 7, часть 7а): их адреса заняты.
    if (params.slug === STAND_SLUG || SPECIAL_PAGE_SLUGS.has(params.slug))
      throw new BadRequestException("slug_collides_with_system_page");
    const pages = Array.isArray(revData.pages) ? revData.pages : [];
    if (pages.some((p: any) => p.slug === params.slug))
      throw new BadRequestException("slug_already_in_use");

    const newId = `page-custom-${crypto.randomUUID()}`;
    const page = customPageOf(newId, params.name, params.slug);
    const placed = await this.newPageSections(site.id, params.name);
    const menus = withMenuItem(menusOf(revData), {
      label: params.name,
      url: params.slug,
    });
    const newRevData = {
      ...revData,
      pages: [...pages, page],
      pagesData: {
        ...(revData.pagesData ?? {}),
        [newId]: {
          content: [],
          root: { props: { title: params.name } },
          zones: {},
        },
      },
      sections: { ...sectionsOf(revData), [newId]: placed },
      menus,
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };
    await this.saveRevision(params.tenantId, site, revisionId, newRevData);
    return { page, sections: { [newId]: placed }, menus };
  }

  // Главную удалить нельзя. Удаление убирает строку страницы, её дерево и секции, её пункты (с подпунктами) из всех
  // меню (п. 20: на проде пункты оставались и вели на 404).
  private async deleteNewThemePage(
    params: { tenantId: string; pageId: string },
    site: SiteRow,
    revisionId: string,
    revData: Record<string, any>,
  ) {
    const pages = Array.isArray(revData.pages) ? revData.pages : [];
    const target = pages.find((p: any) => p.id === params.pageId);
    // Особую страницу (блок 7, часть 7а) удалить нельзя, и когда её строки в ревизии ещё нет.
    if (
      SPECIAL_PAGE_IDS.has(params.pageId) ||
      target?.slug === "/" ||
      target?.role === "system"
    )
      throw new ForbiddenException("cannot_delete_system_page");
    if (!target) throw new NotFoundException("page_not_found");

    const sections = { ...sectionsOf(revData) };
    delete sections[params.pageId];
    const pagesData = { ...(revData.pagesData ?? {}) };
    delete pagesData[params.pageId];
    const menus = menusOf(revData).map((menu) => ({
      ...menu,
      items: withoutUrl(menu.items, target.slug),
    }));
    const newRevData = {
      ...revData,
      pages: pages.filter((p: any) => p.id !== params.pageId),
      pagesData,
      sections,
      menus,
      currentPageId:
        revData.currentPageId === params.pageId
          ? "home"
          : revData.currentPageId,
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };
    await this.saveRevision(params.tenantId, site, revisionId, newRevData);
    return { deleted: params.pageId, menus };
  }

  // Секция новой страницы: первая по имени секция магазина с "newPage", в её настройку — имя страницы.
  private async newPageSections(
    siteId: string,
    name: string,
  ): Promise<SectionInstance[]> {
    const answer = await this.builder?.call("/sections", { shop: siteId });
    const list = answer?.status === 200 ? newPageSectionsOf(answer.body) : null;
    if (list === null) {
      this.logger.warn(
        `new page of ${siteId}: sections list not received (${answer?.status ?? "no builder"})`,
      );
      return [];
    }
    const section = [...list].sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!section) return [];
    const base = section.name.slice(section.name.indexOf(":") + 1).slice(0, 31);
    const id = `${base}-${crypto.randomBytes(4).toString("hex")}`;
    return [
      { id, section: section.name, settings: { [section.newPage]: name } },
    ];
  }

  async updatePage(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
    seo?: { title?: string; description?: string; keywords?: string };
    name?: string;
    content?: string;
  }) {
    return rewriteCurrent(() => this.updatePageOnce(params));
  }

  private async updatePageOnce(params: {
    tenantId: string;
    siteId: string;
    pageId: string;
    seo?: { title?: string; description?: string; keywords?: string };
    name?: string;
    content?: string;
  }) {
    const { site, revisionId, revData } = await this.readCurrent(params);
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

    // Тело контент-страницы («Описание» + заголовок) живёт в секции «Страница»
    // Puck-дерева этой страницы (revData.pagesData[pageId].content[Page].props) —
    // именно оттуда билд берёт heading/content на витрину. Метаданные pages[i] не
    // рендерятся. Трогаем дерево только при изменении name/content (иначе чистый
    // SEO-патч не дёргает pagesData). Тело хранится как есть — авторитетная
    // санитизация на рендере (Page.astro sanitizePageContent), XSS в дерево не течёт.
    let nextPagesData = revData.pagesData;
    const touchesBody =
      params.content !== undefined ||
      (typeof params.name === "string" && !!params.name.trim());
    if (touchesBody) {
      const allPagesData =
        revData.pagesData && typeof revData.pagesData === "object"
          ? (revData.pagesData as Record<string, any>)
          : {};
      const pd = allPagesData[params.pageId] as
        | { content?: unknown }
        | undefined;
      const blocks =
        pd && Array.isArray(pd.content) ? [...(pd.content as any[])] : null;

      // heading нового блока «Страница»: имя из патча, иначе текущее имя страницы.
      const headingFromName =
        typeof params.name === "string" && params.name.trim()
          ? params.name.trim()
          : typeof target.name === "string"
            ? target.name
            : "";
      // Форма блока Page зеркалит createPage (+ heading/content тела). Строим
      // лениво — нужен только на D4-путях создания секции.
      const buildPageBlock = () =>
        emptyPageBlock(params.pageId, {
          heading: headingFromName,
          content: params.content ?? "",
        });

      if (blocks) {
        const pageIdx = blocks.findIndex((b: any) => b?.type === "Page");
        if (pageIdx !== -1) {
          // Секция «Страница» есть — правим тело/заголовок на месте.
          const block = blocks[pageIdx];
          const nextBlock = { ...block, props: { ...(block?.props ?? {}) } };
          if (typeof params.name === "string" && params.name.trim()) {
            nextBlock.props.heading = params.name.trim();
          }
          if (params.content !== undefined) {
            nextBlock.props.content = params.content;
          }
          blocks[pageIdx] = nextBlock;
          nextPagesData = {
            ...allPagesData,
            [params.pageId]: { ...(pd ?? {}), content: blocks },
          };
        } else if (params.content !== undefined) {
          // D4: content-массив есть, но секции «Страница» нет — иначе тело
          // молча терялось бы. Вставляем блок Page перед завершающим Footer
          // (если он есть), иначе в конец.
          const footerIdx = blocks.findIndex((b: any) => b?.type === "Footer");
          const insertAt = footerIdx !== -1 ? footerIdx : blocks.length;
          blocks.splice(insertAt, 0, buildPageBlock());
          nextPagesData = {
            ...allPagesData,
            [params.pageId]: { ...(pd ?? {}), content: blocks },
          };
        }
      } else if (params.content !== undefined) {
        // D4: записи pagesData[pageId] нет (или content не массив) — создаём
        // корректное Puck-дерево (Header + Page + Footer) по образцу createPage,
        // иначе тело молча терялось бы.
        nextPagesData = {
          ...allPagesData,
          [params.pageId]: {
            content: [
              { type: "Header", props: { id: `Header-${params.pageId}` } },
              buildPageBlock(),
              { type: "Footer", props: { id: `Footer-${params.pageId}` } },
            ],
            root: { props: { title: headingFromName } },
            zones: {},
          },
        };
      }
    }

    const newRevData = {
      ...revData,
      pages: newPages,
      pagesData: nextPagesData,
      lockVersion: (revData.lockVersion ?? 1) + 1,
    };

    await this.saveRevision(params.tenantId, site, revisionId, newRevData);

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

    // Сырое содержимое (без миграций/досева) — тем же путём, что readCurrent():
    // normalizeRevision() ниже уже делает нужную этому эндпойнту нормализацию
    // сам, полный `load()` со всеми шагами чтения тут не нужен.
    const loaded = await this.storeContent
      .load(site.id, { site: toStoreContentSite(site), asStored: true })
      .catch((e: unknown) => {
        if (e instanceof Error && e.message === "revision_not_found")
          return null;
        throw e;
      });
    if (!loaded) return { pages: [] };

    const revData = loaded.document as Record<string, any>;
    // Новая тема (блок 7, часть 7а): особые страницы платформы — в списке всегда, и у ревизии, созданной до 7а;
    // нормализация пяти тем ей не нужна.
    const newTheme = await this.isNewTheme(site.id);
    let pages: any[] = newTheme
      ? (withSpecialPages(revData).pages as any[])
      : Array.isArray(revData.pages)
        ? revData.pages
        : [];

    // Нормализуем тем же resolver-путём, что deletePage — гарантирует
    // role/isCustom/slug на каждой странице (legacy-ревизии без `role`).
    // pagesData из нормализованного результата НЕ используем.
    if (site.themeId && !newTheme) {
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
      const manifest = getThemeManifest(site.themeId) as {
        pages?: Array<{ id?: string; isHome?: boolean }>;
      } | null;
      const manifestPages = manifest?.pages ?? [];
      const homeEntry =
        manifestPages.find((p) => p?.isHome) ?? manifestPages[0];
      homePageId =
        homeEntry && typeof homeEntry.id === "string" ? homeEntry.id : null;
    }

    // Тело секции «Страница» тянем из raw pagesData (для гидратации редактора).
    const rawPagesData =
      revData.pagesData && typeof revData.pagesData === "object"
        ? (revData.pagesData as Record<string, unknown>)
        : {};

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
        // role и isCustom — из ОДНОГО предиката. Иначе кастомная страница, чей
        // сохранённый p.role ≠ 'custom' (создана до нормализации / role потерян
        // → normalizeRevision дефолтит его в 'system'), приходила как
        // role:'system'+isCustom:true. Это ломало выбор/удаление в редакторе
        // (гейт по role!=='system'), хотя deletePage её удалить даёт (её нет в
        // манифесте темы). Единый источник истины «кастомная» = isCustom.
        const isCustomPage = p.role === "custom" || Boolean(p.isCustom);
        return {
          id: p.id,
          name: typeof p.name === "string" ? p.name : "",
          slug,
          role: isCustomPage ? ("custom" as const) : ("system" as const),
          isCustom: isCustomPage,
          isHome,
          path,
          // seo — чтобы редактор гидратировался текущими значениями (иначе пустой
          // редактор затрёт сохранённое). null если не задано.
          seo: (p.seo ?? null) as {
            title?: string;
            description?: string;
            keywords?: string;
          } | null,
          // Тело («Описание») из секции «Страница» — для гидратации формы.
          content: extractPageBodyContent(rawPagesData[p.id]),
        };
      }),
    };
  }
}

// ── Новая тема: строка страницы, меню и секции ревизии (блок 1 «Секций и SDK», часть 4) ──

// Адрес своей страницы новой темы: /o-nas — строчные латинские буквы и цифры через дефис.
const NEW_PAGE_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Адрес стенда темы в превью (STAND_PAGE_PATH сборки витрин).
const STAND_SLUG = "/theme-stand";
const MAIN_MENU = "main";
const MAIN_MENU_TITLE = "Главное меню";

// Экспортированы: типы видны в ответах контроллеров (сборка nest build).
export type MenuItem = { label: string; url: string; items?: MenuItem[] };
export type Menu = { id: string; title: string; items: MenuItem[] };
export type SectionInstance = {
  id: string;
  section: string;
  settings: Record<string, string>;
};

// Строка своей страницы в revision.pages — одна форма у пяти тем и у новой темы.
function customPageOf(id: string, name: string, slug: string) {
  return {
    id,
    name,
    slug,
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
}

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sectionsOf = (revData: Record<string, any>): Record<string, unknown> =>
  isRecord(revData.sections) ? revData.sections : {};

const menusOf = (revData: Record<string, any>): Menu[] =>
  Array.isArray(revData.menus) ? revData.menus : [];

// Пункт — в конец меню main; там уже есть пункт с этим адресом — меню как есть; меню main нет — создаётся.
function withMenuItem(menus: Menu[], item: MenuItem): Menu[] {
  const main = menus.find((menu) => menu.id === MAIN_MENU);
  if (main === undefined)
    return [...menus, { id: MAIN_MENU, title: MAIN_MENU_TITLE, items: [item] }];
  if (main.items.some((existing) => existing.url === item.url)) return menus;
  return menus.map((menu) =>
    menu === main ? { ...menu, items: [...menu.items, item] } : menu,
  );
}

// Пункты с адресом страницы — вместе с подпунктами, на всех уровнях.
function withoutUrl(items: MenuItem[], url: string): MenuItem[] {
  return items
    .filter((item) => item.url !== url)
    .map((item) =>
      item.items === undefined
        ? item
        : { ...item, items: withoutUrl(item.items, url) },
    );
}

// Секции из ответа сборщика, которые ставятся на новую страницу. null — ответ не той формы.
function newPageSectionsOf(
  body: string,
): { name: string; newPage: string }[] | null {
  try {
    const value: unknown = JSON.parse(body);
    const sections = isRecord(value) ? value.sections : undefined;
    if (!Array.isArray(sections)) return null;
    return sections.flatMap((item: unknown) =>
      isRecord(item) &&
      typeof item.name === "string" &&
      typeof item.newPage === "string"
        ? [{ name: item.name, newPage: item.newPage }]
        : [],
    );
  } catch {
    return null;
  }
}
