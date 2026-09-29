/**
 * План смены темы — чистая функция (этап 3, кусок 3.3; И4, долги Н3 и Н9).
 *
 * `planThemeSwitch` берёт документ магазина (как его отдаёт порт
 * `StoreContent.load`) и канон новой темы и возвращает новый документ и
 * ОТЧЁТ: что перенесено (свои страницы, меню), что переименовано (Н3), что
 * приведено к полной форме (Н9), что пересеяно (страницы темы), что потеряно
 * (правки мерчанта на страницах темы — сравнением с каноном прежней темы).
 */
import { planThemeSwitch, pageBodyFingerprint } from "../theme-switch.plan";

const header = (
  id: string,
  links: unknown[] = [{ label: "Каталог", href: "/catalog" }],
) => ({
  type: "Header",
  props: { id, navigationLinks: links },
});
const footer = (id: string) => ({ type: "Footer", props: { id } });
const block = (
  type: string,
  id: string,
  props: Record<string, unknown> = {},
) => ({ type, props: { id, ...props } });
const pageData = (content: unknown[]) => ({
  content,
  root: { props: {} },
  zones: {},
});

const themePage = (id: string, slug: string) => ({
  id,
  name: id,
  slug,
  role: "system",
  isCustom: false,
  source: "theme",
  seo: null,
  locale: null,
  variant: null,
  schedule: null,
  permissions: null,
  targeting: null,
});
const userPage = (id: string, slug: string, name = id) => ({
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

/** Канон новой темы: главная, «О нас», каталог. */
function canonOf(theme: string) {
  return {
    manifestVersion: "2.0",
    themeId: theme,
    pages: [
      themePage("home", "/"),
      themePage("page-about", "/about"),
      themePage("page-catalog", "/catalog"),
    ],
    pagesData: {
      home: pageData([
        header(`Header-${theme}`),
        block("Hero", `Hero-${theme}`, { heading: theme }),
        footer(`Footer-${theme}`),
      ]),
      "page-about": pageData([
        header(`Header-about-${theme}`),
        block("Page", `Page-about-${theme}`, { heading: "О нас" }),
      ]),
      "page-catalog": pageData([
        header(`Header-catalog-${theme}`),
        block("Catalog", `Catalog-${theme}`),
      ]),
    },
    themeSettings: {},
    siteOverrides: { pages: {}, blocks: {} },
    currentPageId: "home",
    lockVersion: 1,
  };
}

/** Магазин на rose: главная с правкой мерчанта или без. */
function previousOf(
  opts: {
    editedHero?: boolean;
    extraPages?: any[];
    extraData?: Record<string, unknown>;
    menu?: unknown[];
  } = {},
) {
  const canon = canonOf("rose");
  const home = pageData([
    header("Header-rose", opts.menu),
    block("Hero", "Hero-rose", {
      heading: opts.editedHero ? "Мой заголовок" : "rose",
    }),
    footer("Footer-rose"),
  ]);
  return {
    ...canon,
    pages: [...canon.pages, ...(opts.extraPages ?? [])],
    pagesData: { ...canon.pagesData, home, ...(opts.extraData ?? {}) },
  };
}

describe("planThemeSwitch: перенос своих страниц и меню", () => {
  it("своя страница переезжает с содержимым; страницы темы — из нового канона", () => {
    const custom = pageData([
      header("Header-p1"),
      block("Page", "Page-p1", { heading: "Блог", content: "<p>текст</p>" }),
      footer("Footer-p1"),
    ]);
    const previous = previousOf({
      extraPages: [userPage("p-1", "/blog", "Блог")],
      extraData: { "p-1": custom },
    });

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    expect(document.pages.map((p: any) => p.id)).toEqual([
      "home",
      "page-about",
      "page-catalog",
      "p-1",
    ]);
    expect(document.pagesData["p-1"]).toEqual(custom);
    expect(document.pagesData["page-catalog"]).toEqual(
      canonOf("flux").pagesData["page-catalog"],
    );
    expect(report.carried.pages).toEqual([
      { id: "p-1", slug: "/blog", name: "Блог" },
    ]);
    expect(report.reseeded.pages.map((p) => p.id)).toEqual([
      "home",
      "page-about",
      "page-catalog",
    ]);
    expect(report.renamed).toEqual([]);
    expect(report.normalized).toEqual([]);
  });

  it("меню мерчанта переезжает во все шапки нового канона", () => {
    const menu = [
      { label: "Блог", href: "/blog" },
      { label: "Каталог", href: "/catalog" },
    ];
    const previous = previousOf({ menu });

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    for (const id of ["home", "page-about", "page-catalog"]) {
      const hdr = document.pagesData[id].content.find(
        (b: any) => b.type === "Header",
      );
      expect(hdr.props.navigationLinks).toEqual(menu);
    }
    expect(report.carried.menu).toEqual({ links: 2 });
  });

  it("документ без страниц мерчанта и без меню — ровно канон новой темы", () => {
    const previous = previousOf({ menu: [] });
    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });
    expect(document).toEqual(canonOf("flux"));
    expect(report.carried).toEqual({ pages: [], menu: null });
  });

  it("у магазина нет ревизии — новый документ = канон, в отчёте нечего переносить", () => {
    const { document, report } = planThemeSwitch({
      previous: null,
      canon: canonOf("satin"),
      previousCanon: null,
    });
    expect(document).toEqual(canonOf("satin"));
    expect(report.lost).toEqual([]);
  });
});

describe("planThemeSwitch: входы не меняются", () => {
  const deepFreeze = <T>(o: T): T => {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as Record<string, unknown>))
        deepFreeze(v);
    }
    return o;
  };

  it("канон — общий кэш LazySeed на процесс: план его не мутирует (замороженные входы)", () => {
    const previous = deepFreeze(
      previousOf({
        editedHero: true,
        menu: [{ label: "О нас", href: "/about" }],
        extraPages: [
          userPage("p-about", "/about", "О нас"),
          { id: "p-old", slug: "/old", source: "user", isCustom: true },
        ],
        extraData: {
          "p-about": pageData([header("H"), block("Page", "P")]),
          "p-old": { text: "x" },
        },
      }),
    );
    expect(() =>
      planThemeSwitch({
        previous,
        canon: deepFreeze(canonOf("flux")),
        previousCanon: deepFreeze(canonOf("rose")),
      }),
    ).not.toThrow();
  });
});

describe("planThemeSwitch: Н3 — своя страница со slug системной не теряется", () => {
  it("слаг занят страницей темы — страница сохраняется под слагом с суффиксом, отчёт об этом говорит", () => {
    const about = pageData([
      header("H"),
      block("Page", "Page-my-about", {
        heading: "О нас",
        content: "<p>моё</p>",
      }),
      footer("F"),
    ]);
    const previous = previousOf({
      extraPages: [userPage("p-about", "/about", "О нас (моё)")],
      extraData: { "p-about": about },
      menu: [{ label: "О нас", href: "/about" }],
    });

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    const moved = document.pages.find((p: any) => p.id === "p-about");
    expect(moved.slug).toBe("/about-1");
    // Тело страницы мерчанта цело; шапка, как у всех страниц, несёт меню магазина.
    expect(pageBodyFingerprint(document.pagesData["p-about"])).toBe(
      pageBodyFingerprint(about),
    );
    expect(document.pagesData["p-about"].content[1]).toEqual(about.content[1]);
    // Системная «О нас» новой темы на своём месте.
    expect(document.pages.find((p: any) => p.slug === "/about").id).toBe(
      "page-about",
    );
    expect(report.renamed).toEqual([
      {
        pageId: "p-about",
        fromId: "p-about",
        toId: "p-about",
        fromSlug: "/about",
        toSlug: "/about-1",
        reason: "slug_taken_by_theme_page",
      },
    ]);
    // Пункт меню вёл на страницу мерчанта — и дальше ведёт на неё.
    const hdr = document.pagesData.home.content.find(
      (b: any) => b.type === "Header",
    );
    expect(hdr.props.navigationLinks).toEqual([
      { label: "О нас", href: "/about-1" },
    ]);
    expect(report.menuLinksRewritten).toEqual([
      { from: "/about", to: "/about-1", count: 1 },
    ]);
  });

  it("совпал и id, и slug со страницей темы — новый id и новый slug, содержимое цело", () => {
    const mine = pageData([
      header("H"),
      block("Page", "Page-page-about", { content: "моё" }),
      footer("F"),
    ]);
    const previous = previousOf({
      extraPages: [{ ...userPage("page-about", "/about", "О нас") }],
      extraData: { "page-about": mine },
    });
    // В прежнем документе id `page-about` принадлежит странице мерчанта.
    previous.pages = previous.pages.filter(
      (p: any, i: number, all: any[]) =>
        !(
          p.id === "page-about" &&
          p.source === "theme" &&
          all.some((q) => q.id === "page-about" && q.source === "user")
        ),
    );

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    const ids = document.pages.map((p: any) => p.id);
    expect(ids.filter((id: string) => id === "page-about")).toHaveLength(1);
    expect(document.pagesData["page-about"]).toEqual(
      canonOf("flux").pagesData["page-about"],
    );
    expect(document.pagesData["page-about-1"]).toEqual(mine);
    expect(report.renamed).toEqual([
      {
        pageId: "page-about-1",
        fromId: "page-about",
        toId: "page-about-1",
        fromSlug: "/about",
        toSlug: "/about-1",
        reason: "id_taken_by_theme_page",
      },
    ]);
  });

  it("суффикс подбирается до свободного: /about-1 уже занят своей страницей — /about-2", () => {
    const previous = previousOf({
      extraPages: [
        userPage("p-a", "/about", "A"),
        userPage("p-b", "/about-1", "B"),
      ],
      extraData: { "p-a": pageData([]), "p-b": pageData([]) },
    });

    const { document } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    const slugs = Object.fromEntries(
      document.pages.map((p: any) => [p.id, p.slug]),
    );
    expect(slugs["p-a"]).toBe("/about-2");
    expect(slugs["p-b"]).toBe("/about-1");
  });
});

describe("planThemeSwitch: Н9 — перенесённая страница в полной форме", () => {
  it("легаси {text}: Puck-дерево (шапка и подвал новой темы + секция «Страница» с текстом), root и zones", () => {
    const previous = previousOf({
      extraPages: [
        { id: "p-legacy", slug: "/old", source: "user", isCustom: true },
      ],
      extraData: { "p-legacy": { text: "Старый текст" } },
    });

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    const data = document.pagesData["p-legacy"];
    expect(data.root).toEqual({ props: { title: "p-legacy" } });
    expect(data.zones).toEqual({});
    expect(data.content.map((b: any) => b.type)).toEqual([
      "Header",
      "Page",
      "Footer",
    ]);
    const page = data.content[1];
    expect(page.props).toMatchObject({
      id: "Page-p-legacy",
      heading: "p-legacy",
      content: "Старый текст",
      pageId: "",
    });
    expect(data.content[0].props.id).toBe("Header-p-legacy");
    expect(data.content[2].props.id).toBe("Footer-p-legacy");
    const meta = document.pages.find((p: any) => p.id === "p-legacy");
    expect(meta).toMatchObject({
      name: "p-legacy",
      role: "custom",
      isCustom: true,
      source: "user",
      seo: null,
      targeting: null,
    });
    expect(report.normalized).toEqual([{ pageId: "p-legacy", from: "legacy" }]);
  });

  it("дерево есть, но без root/zones — дописываются, блоки не трогаются", () => {
    const content = [block("Page", "Page-x", { heading: "X" })];
    const previous = previousOf({
      extraPages: [userPage("p-x", "/x", "X")],
      extraData: { "p-x": { content } },
    });

    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });

    expect(document.pagesData["p-x"]).toEqual({
      content,
      root: { props: { title: "X" } },
      zones: {},
    });
    expect(report.normalized).toEqual([]);
  });

  it("полная страница переносится побайтно", () => {
    const full = pageData([header("H-1"), block("Page", "P-1"), footer("F-1")]);
    const previous = previousOf({
      extraPages: [userPage("p-1", "/p", "P")],
      extraData: { "p-1": full },
    });
    const { document } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });
    expect(document.pagesData["p-1"]).toBe(full);
  });
});

describe("planThemeSwitch: что потеряно — правки мерчанта на страницах темы", () => {
  it("правленая главная попадает в «потеряно», нетронутые страницы темы — нет", () => {
    const previous = previousOf({ editedHero: true });
    const { report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });
    expect(report.lost).toEqual([
      {
        pageId: "home",
        slug: "/",
        name: "home",
        reason: "merchant_edits_on_theme_page",
      },
    ]);
    expect(report.lostDetection).toBe("seed-compare");
  });

  it("правка шапки/подвала (общий хром страниц) правкой страницы не считается — меню переносится отдельно", () => {
    const previous = previousOf({ menu: [{ label: "Своё", href: "/x" }] });
    const { report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });
    expect(report.lost).toEqual([]);
  });

  it("страница темы, которой нет в прежнем каноне (не с чем сравнить), и она не пустая — потеряна", () => {
    const previous = previousOf({
      extraPages: [themePage("page-promo", "/promo")],
      extraData: {
        "page-promo": pageData([
          block("Hero", "Hero-promo", { heading: "Акция" }),
        ]),
      },
    });
    const { document, report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: canonOf("rose"),
    });
    expect(document.pages.map((p: any) => p.id)).not.toContain("page-promo");
    expect(report.lost).toEqual([
      {
        pageId: "page-promo",
        slug: "/promo",
        name: "page-promo",
        reason: "theme_page_dropped",
      },
    ]);
  });

  it("нетронутая страница прежней темы, которой нет в новой, — «убрана», но не «потеряна»", () => {
    const previousCanon = canonOf("rose");
    previousCanon.pages.push(
      themePage("page-checkout-result", "/checkout-result"),
    );
    (previousCanon.pagesData as Record<string, unknown>)[
      "page-checkout-result"
    ] = pageData([block("CheckoutResult", "CR-1")]);
    const previous = {
      ...previousOf(),
      pages: [
        ...previousOf().pages,
        themePage("page-checkout-result", "/checkout-result"),
      ],
      pagesData: {
        ...previousOf().pagesData,
        "page-checkout-result": pageData([block("CheckoutResult", "CR-1")]),
      },
    };

    const { report } = planThemeSwitch({
      previous,
      canon: canonOf("vanilla"),
      previousCanon,
    });

    expect(report.dropped).toEqual([
      { pageId: "page-checkout-result", slug: "/checkout-result" },
    ]);
    expect(report.lost).toEqual([]);
  });

  it("канона прежней темы нет (тема магазина без пакета) — «потерянное» не угадываем, так и пишем", () => {
    const previous = previousOf({ editedHero: true });
    const { report } = planThemeSwitch({
      previous,
      canon: canonOf("flux"),
      previousCanon: null,
    });
    expect(report.lostDetection).toBe("unavailable");
    expect(report.lost).toEqual([]);
    expect(report.dropped).toEqual([]);
  });

  it("отпечаток тела страницы не зависит от id блоков и хрома", () => {
    const a = pageData([
      header("H-1"),
      block("Hero", "Hero-1", { heading: "x" }),
      footer("F-1"),
    ]);
    const b = pageData([
      header("H-2", []),
      block("Hero", "Hero-2", { heading: "x" }),
      footer("F-2"),
    ]);
    expect(pageBodyFingerprint(a)).toBe(pageBodyFingerprint(b));
    expect(pageBodyFingerprint(a)).not.toBe(
      pageBodyFingerprint(
        pageData([block("Hero", "Hero-1", { heading: "y" })]),
      ),
    );
  });
});
