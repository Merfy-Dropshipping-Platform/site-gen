/**
 * Команда «сменить тему» — `SetTheme` (этап 3, кусок 3.3; И4, Н3, Н9).
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И4:
 * «слаг проверяется по каталогу (опечатка → ошибка); ответ — отчёт: что
 * перенесено, что пересеяно, что потеряно. Страница мерчанта со slug системной
 * не теряется (Н3). Переиздание опубликованного магазина — с видимым статусом».
 *
 * Круг по пяти темам идёт по НАСТОЯЩЕМУ пути: канон темы — настоящий
 * `buildInitialRevision` (пакеты тем с диска), чтение и запись ревизии —
 * настоящий `DocumentAdapter` (миграции, досев, адреса ассетов) поверх
 * БД-заглушки, которая хранит ревизии в памяти. Проверка «отчёт совпадает с
 * фактом» сверяет каждую строку отчёта с документом, который реально записан.
 */
import { SetThemeCommand } from "../set-theme.command";
import { pageBodyFingerprint } from "../theme-switch.plan";
import { DocumentAdapter } from "../../../content/document.adapter";
import { SitesDomainService } from "../../../sites.service";
import type { ThemeCatalog, CatalogTheme } from "../../theme-catalog";

const THEMES = ["rose", "flux", "satin", "bloom", "vanilla"] as const;

function catalogOf(ids: readonly string[]): ThemeCatalog {
  const themes = ids.map((id) => ({ id, name: id, slug: id }) as CatalogTheme);
  return {
    defaultThemeId: "rose",
    list: async () => themes,
    find: async (id: string) => themes.find((t) => t.id === id) ?? null,
  };
}

/** БД-заглушка ровно под `DocumentAdapter`: ревизии в памяти, одна текущая. */
function revisionStore() {
  const revisions = new Map<
    string,
    { data: any; meta: any; createdBy?: string }
  >();
  const state = { current: null as string | null };
  const insertRevision = async (v: any) => {
    revisions.set(v.id, {
      data: JSON.parse(JSON.stringify(v.data)),
      meta: v.meta,
      createdBy: v.createdBy,
    });
  };
  const db: any = {
    select: () => ({
      from: () => ({
        where: async () =>
          state.current
            ? [
                {
                  data: JSON.parse(
                    JSON.stringify(revisions.get(state.current)!.data),
                  ),
                },
              ]
            : [],
      }),
    }),
    insert: () => ({ values: insertRevision }),
    update: () => ({
      set: (v: any) => ({
        where: async () => {
          if (v.currentRevisionId) state.current = v.currentRevisionId;
        },
      }),
    }),
    transaction: async (work: (tx: any) => Promise<void>) => {
      const tx = {
        insert: () => ({ values: insertRevision }),
        update: () => ({
          set: (v: any) => ({
            where: () => ({
              returning: async () => {
                state.current = v.currentRevisionId;
                return [{ id: "site-1" }];
              },
            }),
          }),
        }),
      };
      await work(tx);
    },
  };
  return { db, revisions, state };
}

function makeBareSites(): SitesDomainService {
  const dep = {} as any;
  return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
}

function setup(
  opts: { themeId?: string; status?: string; initial?: any } = {},
) {
  const store = revisionStore();
  const content = new DocumentAdapter(store.db);
  const bare = makeBareSites();
  const site = {
    id: "site-1",
    tenantId: "t1",
    name: "Шёлк",
    themeId: opts.themeId ?? "rose",
    status: opts.status ?? "draft",
    publicUrl: null as string | null,
    currentRevisionId: null as string | null,
    contentModel: "document",
    themeAppliedAt: null as Date | null,
  };
  if (opts.initial) {
    store.revisions.set("rev-0", { data: opts.initial, meta: {} });
    store.state.current = "rev-0";
    site.currentRevisionId = "rev-0";
  }
  const sites = {
    get: jest.fn(async (tenantId: string, siteId: string) =>
      tenantId === site.tenantId && siteId === site.id
        ? { ...site, currentRevisionId: store.state.current }
        : null,
    ),
    buildInitialRevision: jest.fn((themeId: string) =>
      bare.buildInitialRevision(themeId),
    ),
    recordThemeChoice: jest.fn(async ({ themeId }: { themeId: string }) => {
      site.themeId = themeId;
      site.themeAppliedAt = new Date();
      return true;
    }),
    publish: jest.fn(async () => ({
      url: "https://shop.merfy.ru",
      buildId: "b-1",
      artifactUrl: "",
    })),
  };
  const events: Array<{ pattern: string; payload: any }> = [];
  const command = new SetThemeCommand(
    sites as any,
    content,
    catalogOf(THEMES),
    {
      emit: (pattern: string, payload: any) =>
        events.push({ pattern, payload }),
    } as any,
  );
  return { command, sites, site, store, events };
}

// ---------------------------------------------------------------------------
// Исходный магазин для круга: канон rose + правки мерчанта
// ---------------------------------------------------------------------------

async function merchantRoseStore() {
  // Копия: канон темы — общий кэш LazySeed на процесс, мутировать его нельзя.
  const doc: any = JSON.parse(
    JSON.stringify(await makeBareSites().buildInitialRevision("rose")),
  );
  const home = doc.pagesData.home;
  const header = home.content.find((b: any) => b.type === "Header");
  const footer = home.content.find((b: any) => b.type === "Footer");
  const hero = home.content.find((b: any) => b.type === "Hero");
  // Правка мерчанта на странице темы — пересев её заменит («потеряно»).
  // Как её сохраняет конструктор: своя картинка вместо демо-фото темы (демо
  // миграция на чтении снимает вместе с текстами — «нетронутая секция») и свой
  // заголовок.
  hero.props = {
    id: hero.props.id,
    backgroundImages: {
      url1: "https://minio.merfy.ru/product-images/merchant-shelk-hero.png",
    },
    heading: { text: "Шёлк — ткани ручной работы" },
  };
  // Меню мерчанта: своя страница и своя «О нас».
  const menu = [
    { label: "Каталог", href: "/catalog" },
    { label: "Блог", href: "/blog" },
    { label: "О нас", href: "/about" },
  ];
  for (const page of Object.values<any>(doc.pagesData)) {
    const h = page?.content?.find?.((b: any) => b.type === "Header");
    if (h) h.props = { ...h.props, navigationLinks: menu };
  }
  const userPage = (id: string, slug: string, name: string) => ({
    id,
    name,
    slug,
    role: "custom",
    isCustom: true,
    source: "user",
    createdAt: 1,
    seo: null,
    locale: null,
    variant: null,
    schedule: null,
    permissions: null,
    targeting: null,
  });
  const pageTree = (id: string, heading: string, text: string) => ({
    content: [
      { ...header, props: { ...header.props, id: `Header-${id}` } },
      {
        type: "Page",
        props: {
          id: `Page-${id}`,
          pageId: "",
          heading,
          content: text,
          headingSize: "medium",
          colorScheme: "scheme-1",
          padding: { top: 80, bottom: 80 },
        },
      },
      { ...footer, props: { ...footer.props, id: `Footer-${id}` } },
    ],
    root: { props: { title: heading } },
    zones: {},
  });
  doc.pages.push(userPage("p-blog", "/blog", "Блог"));
  doc.pagesData["p-blog"] = pageTree("p-blog", "Блог", "<p>Наши новости</p>");
  // Н3: своя страница на слаге системной «О нас».
  doc.pages.push(userPage("p-about", "/about", "О нас (наше)"));
  doc.pagesData["p-about"] = pageTree(
    "p-about",
    "О нас",
    "<p>Мы шьём с 1998 года</p>",
  );
  // Н9: легаси-страница без дерева.
  doc.pages.push({
    id: "p-old",
    slug: "/old-news",
    source: "user",
    isCustom: true,
  });
  doc.pagesData["p-old"] = { text: "Старые новости" };
  return { doc, menu };
}

// ---------------------------------------------------------------------------
// «Отчёт совпадает с фактом»: каждая строка отчёта сверяется с документом
// ---------------------------------------------------------------------------

function headersOf(doc: any): any[] {
  return Object.values<any>(doc.pagesData)
    .map((p) => p?.content?.find?.((b: any) => b.type === "Header"))
    .filter(Boolean);
}

function expectReportMatchesFact(
  prev: any,
  next: any,
  canon: any,
  report: any,
  menu: any[],
) {
  const nextIds = next.pages.map((p: any) => p.id);
  // Пересеяно: ровно страницы канона новой темы, в его порядке, с его телом.
  expect(report.reseeded.pages).toEqual(
    canon.pages.map((p: any) => ({ id: p.id, slug: p.slug })),
  );
  for (const { id } of report.reseeded.pages) {
    expect(pageBodyFingerprint(next.pagesData[id])).toBe(
      pageBodyFingerprint(canon.pagesData[id]),
    );
  }
  // Перенесено: страницы после канона — ровно перенесённые, с тем же телом.
  expect(nextIds).toEqual([
    ...canon.pages.map((p: any) => p.id),
    ...report.carried.pages.map((p: any) => p.id),
  ]);
  const renamedFrom = new Map(
    report.renamed.map((r: any) => [r.toId, r.fromId]),
  );
  const normalized = new Set(report.normalized.map((n: any) => n.pageId));
  for (const carried of report.carried.pages) {
    const meta = next.pages.find((p: any) => p.id === carried.id);
    expect(meta).toMatchObject({
      slug: carried.slug,
      name: carried.name,
      role: "custom",
      isCustom: true,
      source: "user",
    });
    const data = next.pagesData[carried.id];
    expect(data).toMatchObject({
      root: expect.any(Object),
      zones: expect.any(Object),
    });
    expect(Array.isArray(data.content)).toBe(true);
    const fromId = renamedFrom.get(carried.id) ?? carried.id;
    if (normalized.has(carried.id)) {
      expect(
        data.content.find((b: any) => b.type === "Page").props.content,
      ).toBe(prev.pagesData[fromId].text);
    } else {
      expect(pageBodyFingerprint(data)).toBe(
        pageBodyFingerprint(prev.pagesData[fromId]),
      );
    }
  }
  // Переименовано: новый слаг у страницы мерчанта, старый — у страницы темы.
  for (const r of report.renamed) {
    expect(next.pages.find((p: any) => p.id === r.toId).slug).toBe(r.toSlug);
    expect(
      canon.pages.some((p: any) => p.slug === r.fromSlug || p.id === r.fromId),
    ).toBe(true);
  }
  // Убрано и потеряно — только то, чего в новом документе нет или что заменено.
  for (const d of report.dropped) expect(nextIds).not.toContain(d.pageId);
  for (const l of report.lost) {
    if (l.reason === "theme_page_dropped")
      expect(nextIds).not.toContain(l.pageId);
    else expect(nextIds).toContain(l.pageId);
  }
  // Меню: во всех шапках нового документа — меню магазина.
  for (const header of headersOf(next))
    expect(header.props.navigationLinks).toEqual(menu);
  expect(report.carried.menu).toEqual({ links: menu.length });
}

describe("SetTheme: пять тем по кругу — отчёт совпадает с фактом", () => {
  it("rose → flux → satin → bloom → vanilla → rose", async () => {
    const { doc, menu } = await merchantRoseStore();
    const { command, store, site } = setup({ themeId: "rose", initial: doc });
    const menuAfterRename = menu.map((l) =>
      l.href === "/about" ? { ...l, href: "/about-1" } : l,
    );
    const circle = ["flux", "satin", "bloom", "vanilla", "rose"];

    for (const [step, themeId] of circle.entries()) {
      const prevRevisionId = store.state.current!;
      const prevDoc = (
        await new DocumentAdapter(store.db).load("site-1", {
          site: { ...site, currentRevisionId: prevRevisionId } as any,
        })
      ).document;

      const result = await command.execute({
        tenantId: "t1",
        siteId: "site-1",
        themeId,
        actorUserId: "u1",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const effect = result.effect;
      expect(effect).toMatchObject({
        changed: true,
        toThemeId: themeId,
        previousRevisionId: prevRevisionId,
      });
      expect(effect.revisionId).toBe(store.state.current);
      expect(site.themeId).toBe(themeId);
      const written = store.revisions.get(effect.revisionId!)!;
      expect(written.meta).toMatchObject({
        source: "theme-switch",
        actor: "merchant",
        toThemeId: themeId,
      });
      const canon = await makeBareSites().buildInitialRevision(themeId);
      expectReportMatchesFact(
        prevDoc,
        written.data,
        canon,
        effect.report,
        menuAfterRename,
      );

      if (step === 0) {
        // Первая смена: правленая главная потеряна, Н3 и Н9 отработали.
        expect(effect.report!.lost.map((l) => l.pageId)).toEqual(["home"]);
        expect(effect.report!.renamed).toEqual([
          {
            pageId: "p-about",
            fromId: "p-about",
            toId: "p-about",
            fromSlug: "/about",
            toSlug: "/about-1",
            reason: "slug_taken_by_theme_page",
          },
        ]);
        expect(effect.report!.normalized).toEqual([
          { pageId: "p-old", from: "legacy" },
        ]);
        expect(effect.report!.menuLinksRewritten).toEqual([
          { from: "/about", to: "/about-1", count: 1 },
        ]);
        expect(effect.report!.carried.pages.map((p) => p.id)).toEqual([
          "p-blog",
          "p-about",
          "p-old",
        ]);
      } else {
        // Дальше страницы темы нетронутые: терять нечего, переименовывать нечего.
        expect(effect.report!.lost).toEqual([]);
        expect(effect.report!.renamed).toEqual([]);
        expect(effect.report!.normalized).toEqual([]);
        expect(effect.report!.carried.pages.map((p) => p.id)).toEqual([
          "p-blog",
          "p-about",
          "p-old",
        ]);
      }
    }
    expect(site.themeId).toBe("rose");
  });
});

describe("SetTheme: проверки входа и тема по каталогу", () => {
  it("опечатка в слаге темы — unknown_theme, ничего не записано, тема магазина прежняя", async () => {
    const { command, sites, site, store } = setup({
      initial: { pages: [], pagesData: {} },
    });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "opechatka",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "unknown_theme",
        themeId: "opechatka",
        available: [...THEMES],
      },
    });
    expect(store.revisions.size).toBe(1);
    expect(site.themeId).toBe("rose");
    expect(sites.recordThemeChoice).not.toHaveBeenCalled();
  });

  it("чужой или несуществующий магазин — site_not_found", async () => {
    const { command } = setup();
    const result = await command.execute({
      tenantId: "other",
      siteId: "site-1",
      themeId: "flux",
    });
    expect(result).toEqual({ ok: false, error: { code: "site_not_found" } });
  });

  it("та же тема — ничего не пересеивается, эффект «без изменений»", async () => {
    const { command, store, sites } = setup({
      themeId: "flux",
      initial: { pages: [], pagesData: {} },
    });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
    });
    expect(result).toEqual({
      ok: true,
      effect: {
        changed: false,
        siteId: "site-1",
        fromThemeId: "flux",
        toThemeId: "flux",
        revisionId: "rev-0",
        previousRevisionId: "rev-0",
        report: null,
        republish: { status: "not_needed", reason: "same_theme" },
      },
    });
    expect(store.revisions.size).toBe(1);
    expect(sites.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["без темы", { tenantId: "t1", siteId: "site-1" }],
    ["без магазина", { tenantId: "t1", themeId: "flux" }],
    ["без тенанта", { siteId: "site-1", themeId: "flux" }],
  ])("%s → invalid_input", async (_t, input) => {
    const { command } = setup();
    expect(await command.execute(input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
  });
});

describe("SetTheme: запись и переиздание", () => {
  it("магазин без ревизии: пишется канон новой темы с CAS «ревизии нет»", async () => {
    const { command, store } = setup({ themeId: "rose" });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "satin",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.previousRevisionId).toBeNull();
    expect(store.revisions.get(result.effect.revisionId!)!.data.themeId).toBe(
      "satin",
    );
  });

  it("чужая запись между чтением и записью — revision_conflict, тема магазина не меняется", async () => {
    const { command, sites, site } = setup({
      initial: { pages: [], pagesData: {} },
    });
    const conflicting = {
      load: async () => ({
        document: { pages: [], pagesData: {} },
        version: "rev-0",
      }),
      save: async () => {
        throw new Error("revision_conflict");
      },
    };
    (command as any).content = conflicting;

    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
    });

    expect(result).toEqual({ ok: false, error: { code: "revision_conflict" } });
    expect(sites.recordThemeChoice).not.toHaveBeenCalled();
    expect(site.themeId).toBe("rose");
  });

  it("черновик — переиздание не нужно", async () => {
    const { command, sites } = setup({
      status: "draft",
      initial: { pages: [], pagesData: {} },
    });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
    });
    expect(result.ok && result.effect.republish).toEqual({
      status: "not_needed",
      reason: "not_published",
    });
    expect(sites.publish).not.toHaveBeenCalled();
  });

  it("опубликованный — переиздание запущено фоном (статус started)", async () => {
    const { command, sites } = setup({
      status: "published",
      initial: { pages: [], pagesData: {} },
    });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
    });
    expect(result.ok && result.effect.republish).toEqual({ status: "started" });
    await command.settle();
    expect(sites.publish).toHaveBeenCalledWith({
      tenantId: "t1",
      siteId: "site-1",
      mode: "production",
    });
  });

  it("опубликованный, wait:true — ответ несёт итог переиздания", async () => {
    const { command } = setup({
      status: "published",
      initial: { pages: [], pagesData: {} },
    });
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
      wait: true,
    });
    expect(result.ok && result.effect.republish).toEqual({
      status: "done",
      url: "https://shop.merfy.ru",
      buildId: "b-1",
    });
  });

  it("переиздание упало — статус failed с причиной, смена темы при этом состоялась", async () => {
    const { command, sites, site } = setup({
      status: "published",
      initial: { pages: [], pagesData: {} },
    });
    sites.publish.mockRejectedValueOnce(new Error("build failed"));
    const result = await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "flux",
      wait: true,
    });
    expect(result.ok && result.effect.republish).toEqual({
      status: "failed",
      error: "build failed",
    });
    expect(site.themeId).toBe("flux");
  });

  it("событие sites.site.updated — как у старого PATCH { themeId }", async () => {
    const { command, events } = setup({
      initial: { pages: [], pagesData: {} },
    });
    await command.execute({
      tenantId: "t1",
      siteId: "site-1",
      themeId: "bloom",
    });
    expect(events).toContainEqual({
      pattern: "sites.site.updated",
      payload: {
        tenantId: "t1",
        siteId: "site-1",
        patch: { themeId: "bloom" },
      },
    });
  });
});
