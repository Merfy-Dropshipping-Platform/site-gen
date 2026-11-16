/**
 * «Что проверить после правки» (решение владельца 16.11): только изменённые
 * секции; шапка и подвал — сами, один раз; новая страница — целиком; тема —
 * вид, а не разметка. Адреса берём у настоящего движка: `diff` черновика до и
 * после правки, как их считает запись (`save-on-base.ts`).
 */
import { checkScope } from "../check-scope";
import { diff, paths } from "../operations";
import { saveOnBase } from "../save-on-base";
import type { RevisionStore } from "../save-on-base";
import { StoreContentService } from "../store-content.service";
import type { WriteModel } from "../write-model";

type Doc = Record<string, any>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const draft = (): Doc => ({
  pages: [
    { id: "home", name: "Главная", slug: "/", seo: null },
    { id: "page-about", name: "О нас", slug: "/about", seo: null },
  ],
  sections: {
    header: [{ id: "header-1", section: "header", settings: { menu: "main" } }],
    footer: [
      { id: "footer-1", section: "footer", settings: { menu: "footer" } },
    ],
    home: [
      { id: "hero-1", section: "hero", settings: { heading: "Простые вещи" } },
      {
        id: "products-1",
        section: "products",
        settings: { heading: "Новинки" },
      },
      { id: "faq-1", section: "faq", settings: { heading: "Вопросы" } },
    ],
    "page-about": [{ id: "text-1", section: "text", settings: { text: "Мы" } }],
  },
  menus: [
    {
      id: "main",
      title: "Главное",
      items: [{ label: "Каталог", url: "/catalog" }],
    },
  ],
  tokens: { "color-accent": "#0B9E90" },
});

const scopeOf = (before: Doc, after: Doc) =>
  checkScope(paths(diff(before, after)), after);

const homeSection = (doc: Doc, id: string): Doc =>
  doc.sections.home.find((s: Doc) => s.id === id);

describe("что проверить после правки", () => {
  it("правка в одной секции — только она", () => {
    const before = draft();
    const after = clone(before);
    homeSection(after, "hero-1").settings.heading = "Новый заголовок";
    expect(scopeOf(before, after)).toEqual({
      sections: [{ page: "home", id: "hero-1" }],
      pages: [],
      theme: false,
    });
  });

  it("мерчант поменял две секции, не зная, что это секции, — обе, и только они", () => {
    const before = draft();
    const after = clone(before);
    homeSection(after, "hero-1").settings.heading = "Весна";
    homeSection(after, "faq-1").settings.heading = "Частые вопросы";
    const scope = scopeOf(before, after);
    expect(scope.sections).toEqual(
      expect.arrayContaining([
        { page: "home", id: "hero-1" },
        { page: "home", id: "faq-1" },
      ]),
    );
    expect(scope.sections).toHaveLength(2);
    expect(scope.pages).toEqual([]);
  });

  it("несколько правок одной секции — она один раз", () => {
    const before = draft();
    const after = clone(before);
    homeSection(after, "hero-1").settings.heading = "Весна";
    homeSection(after, "hero-1").settings.subheading = "Скидки";
    expect(scopeOf(before, after).sections).toEqual([
      { page: "home", id: "hero-1" },
    ]);
  });

  it("правка шапки — шапка один раз, а не каждая страница", () => {
    const before = draft();
    const after = clone(before);
    after.sections.header[0].settings.sticky = true;
    expect(scopeOf(before, after)).toEqual({
      sections: [{ page: "header", id: "header-1" }],
      pages: [],
      theme: false,
    });
  });

  it("новая страница — целиком", () => {
    const before = draft();
    const after = clone(before);
    after.pages.push({
      id: "page-delivery",
      name: "Доставка",
      slug: "/delivery",
      seo: null,
    });
    after.sections["page-delivery"] = [
      { id: "text-2", section: "text", settings: { text: "Привезём" } },
      { id: "faq-2", section: "faq", settings: {} },
    ];
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [{ page: "page-delivery", whole: true }],
      theme: false,
    });
  });

  it("добавили секцию — она; правила страницы проверяющий гоняет вместе с ней", () => {
    const before = draft();
    const after = clone(before);
    after.sections.home.splice(1, 0, {
      id: "banner-1",
      section: "banner",
      settings: {},
    });
    expect(scopeOf(before, after)).toEqual({
      sections: [{ page: "home", id: "banner-1" }],
      pages: [],
      theme: false,
    });
  });

  it("убрали секцию — смотреть нечего, но правила страницы заново", () => {
    const before = draft();
    const after = clone(before);
    after.sections.home = after.sections.home.filter(
      (s: Doc) => s.id !== "hero-1",
    );
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [{ page: "home", whole: false }],
      theme: false,
    });
  });

  it("скрыли секцию — правила страницы; показали снова — секция", () => {
    const before = draft();
    const hidden = clone(before);
    homeSection(hidden, "hero-1").hidden = true;
    expect(scopeOf(before, hidden)).toEqual({
      sections: [],
      pages: [{ page: "home", whole: false }],
      theme: false,
    });
    expect(scopeOf(hidden, before).sections).toEqual([
      { page: "home", id: "hero-1" },
    ]);
  });

  it("переставили секции — правила страницы: порядок заголовков другой", () => {
    const before = draft();
    const after = clone(before);
    after.sections.home.reverse();
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [{ page: "home", whole: false }],
      theme: false,
    });
  });

  it("убрали одну секцию и поменяли другую на той же странице — секция, страница отдельно не нужна", () => {
    const before = draft();
    const after = clone(before);
    after.sections.home = after.sections.home.filter(
      (s: Doc) => s.id !== "faq-1",
    );
    homeSection(after, "hero-1").settings.heading = "Весна";
    expect(scopeOf(before, after)).toEqual({
      sections: [{ page: "home", id: "hero-1" }],
      pages: [],
      theme: false,
    });
  });

  it("правка меню — шапка и подвал, где меню стоят", () => {
    const before = draft();
    const after = clone(before);
    after.menus[0].items.push({ label: "Доставка", url: "/delivery" });
    expect(scopeOf(before, after)).toEqual({
      sections: [
        { page: "header", id: "header-1" },
        { page: "footer", id: "footer-1" },
      ],
      pages: [],
      theme: false,
    });
  });

  it("тема (токены, настройки темы) — только флаг темы, секции не трогаем", () => {
    const before = draft();
    const after = clone(before);
    after.tokens["color-accent"] = "#D0590A";
    after.settings = { cartIcon: "bag" };
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [],
      theme: true,
    });
  });

  it("имя, адрес или SEO страницы — правила этой страницы", () => {
    const before = draft();
    const after = clone(before);
    after.pages[1].seo = { title: "О магазине" };
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [{ page: "page-about", whole: false }],
      theme: false,
    });
  });

  it("удалили страницу — проверять нечего", () => {
    const before = draft();
    const after = clone(before);
    after.pages = after.pages.filter((p: Doc) => p.id !== "page-about");
    delete after.sections["page-about"];
    expect(scopeOf(before, after)).toEqual({
      sections: [],
      pages: [],
      theme: false,
    });
  });

  it("адреса пяти тем и служебные поля — не про витрину новой темы", () => {
    expect(
      checkScope(
        [
          "page:home/block:Hero-1/props/heading/text",
          "currentPageId",
          "lockVersion",
        ],
        draft(),
      ),
    ).toEqual({ sections: [], pages: [], theme: false });
  });

  it("секция с адресом, которого нет в документе (гонка с чужим удалением), — не секция", () => {
    expect(
      checkScope(["sections/home/ghost-1/settings/heading"], draft()),
    ).toEqual({
      sections: [],
      pages: [{ page: "home", whole: false }],
      theme: false,
    });
  });
});

describe("что проверить — в ответе записи", () => {
  const IDENTITY_MODEL: WriteModel = {
    normalize: async (doc) => doc ?? {},
    filterForWrite: (doc) => doc,
    isAutoValue: () => false,
    isDerived: () => false,
  };
  const logger = { log: () => undefined, warn: () => undefined };

  function storeWith(current: Doc) {
    const commit = jest.fn(async () => true);
    const store: RevisionStore = {
      fetchData: async () => clone(current),
      readPointer: async () => "r0",
      writeModel: async () => IDENTITY_MODEL,
      commit,
    };
    return { store, commit };
  }

  const onBase = (document: Doc) =>
    ({
      mode: "on-base",
      base: "r0",
      mergePolicy: "last-writer-wins",
      tenantId: "tenant-1",
      site: { themeId: "nova", publicUrl: null, currentRevisionId: "r0" },
      document,
    }) as never;

  it("запись nova: секция в ответе, в meta ревизии — только адреса", async () => {
    const before = draft();
    const after = clone(before);
    homeSection(after, "faq-1").settings.heading = "Частые вопросы";
    const { store, commit } = storeWith(before);

    const saved = await saveOnBase(
      store,
      "site-1",
      onBase(after),
      logger as never,
    );

    expect(saved.effect?.checkScope).toEqual({
      sections: [{ page: "home", id: "faq-1" }],
      pages: [],
      theme: false,
    });
    const [{ rows }] = commit.mock.calls[0] as unknown as [
      { rows: Array<{ meta: Doc }> },
    ];
    expect(rows[0].meta.changes).toEqual([
      "sections/home/faq-1/settings/heading",
    ]);
    expect(rows[0].meta).not.toHaveProperty("checkScope");
  });

  it("ответ sites.revisions.create несёт checkScope рядом с revisionId", async () => {
    const before = draft();
    const after = clone(before);
    after.sections.header[0].settings.sticky = true;
    const { store } = storeWith(before);
    const adapter = {
      save: (siteId: string, params: never) =>
        saveOnBase(store, siteId, params, logger as never),
    };
    const service = new StoreContentService(adapter as never);

    const result = await service.createRevision("site-1", {
      site: { themeId: "nova", publicUrl: null, currentRevisionId: "r0" },
      tenantId: "tenant-1",
      data: after,
      setCurrent: true,
      base: "r0",
      mergePolicy: "last-writer-wins",
    } as never);

    expect(result.checkScope).toEqual({
      sections: [{ page: "header", id: "header-1" }],
      pages: [],
      theme: false,
    });
  });
});
