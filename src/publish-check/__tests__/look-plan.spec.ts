/**
 * Проверка публикации (16.11): что изменилось с прошлой публикации (адаптер документа, те же правила, что у записи от
 * базы) → какие страницы снимать → какие находки снимка брать. Владелец: «поменялась одна секция — проверяем её».
 */
import { DocumentAdapter } from "../../content/document.adapter";
import { RevisionNotFoundError } from "../../content/store-content.port";
import { makeFakeRevisionDb } from "../../content/__tests__/fake-revision-db";
import { findingsOf, lookJobOf, lookTargets } from "../look-plan";

const SITE = "site-1";
const NOVA = { themeId: "nova", publicUrl: null, currentRevisionId: "r1" };

const draft = () => ({
  sections: {
    header: [
      { id: "header-1", section: "shop:header", settings: { logo: "Шарфы" } },
    ],
    home: [
      {
        id: "hero-1",
        section: "shop:hero",
        settings: { heading: "Тёплые шарфы" },
      },
      { id: "faq-1", section: "shop:faq", settings: { heading: "Вопросы" } },
    ],
    catalog: [{ id: "grid-1", section: "shop:grid", settings: {} }],
  },
  pages: [],
  tokens: {},
  settings: {},
});

describe("что изменилось с прошлой публикации", () => {
  function setup() {
    const fake = makeFakeRevisionDb({
      id: SITE,
      tenantId: "t-1",
      themeId: "nova",
    });
    const before = draft();
    const after = draft();
    after.sections.home[1].settings.heading = "Частые вопросы";
    fake.seedRevision("r0", before);
    fake.seedRevision("r1", after);
    return new DocumentAdapter(fake.db);
  }

  it("правка одной секции — только она, без страниц и темы", async () => {
    const scope = await setup().checkScopeBetween(SITE, "r0", "r1", {
      site: NOVA,
    });
    expect(scope).toEqual({
      sections: [{ page: "home", id: "faq-1" }],
      pages: [],
      theme: false,
    });
  });

  it("первая публикация или опубликованной ревизии нет — весь магазин: шапка целиком, каждая страница целиком", async () => {
    const adapter = setup();
    const first = await adapter.checkScopeBetween(SITE, null, "r1", {
      site: NOVA,
    });
    expect(first.sections).toEqual([{ page: "header", id: "header-1" }]);
    expect(first.pages).toEqual([
      { page: "home", whole: true },
      { page: "catalog", whole: true },
    ]);
    expect(
      await adapter.checkScopeBetween(SITE, "gone", "r1", { site: NOVA }),
    ).toEqual(first);
  });

  it("проверяемой ревизии нет — ошибка «ревизии нет»", async () => {
    await expect(
      setup().checkScopeBetween(SITE, "r0", "nope", { site: NOVA }),
    ).rejects.toBeInstanceOf(RevisionNotFoundError);
  });
});

describe("какие страницы снимать", () => {
  it("секции страницы — её снимок с этими секциями; шапка и подвал — на главной; главная первой", () => {
    const targets = lookTargets({
      sections: [
        { page: "catalog", id: "grid-1" },
        { page: "home", id: "faq-1" },
        { page: "header", id: "header-1" },
      ],
      pages: [],
      theme: false,
    });
    expect(targets).toEqual([
      { page: "home", take: { kind: "sections", ids: ["faq-1", "header-1"] } },
      { page: "catalog", take: { kind: "sections", ids: ["grid-1"] } },
    ]);
    expect(lookJobOf(targets[0])).toEqual({
      page: "home",
      devices: "both",
      full: false,
      clips: false,
      sections: ["faq-1", "header-1"],
    });
  });

  it("новая страница — вся; секцию убрали или переставили — только правила страницы; тема — снимать нечего", () => {
    const targets = lookTargets({
      sections: [],
      pages: [
        { page: "page-delivery", whole: true },
        { page: "catalog", whole: false },
      ],
      theme: true,
    });
    expect(targets).toEqual([
      { page: "page-delivery", take: { kind: "all" } },
      { page: "catalog", take: { kind: "page-rules" } },
    ]);
    expect(lookJobOf(targets[0])).not.toHaveProperty("sections");
    expect(lookTargets({ sections: [], pages: [], theme: true })).toEqual([]);
  });
});

describe("какие находки снимка брать", () => {
  const semantic = (
    rule: string,
    section: string | null,
    level: "error" | "warning" = "warning",
  ) => ({
    place: "html" as const,
    check: "semantic",
    rule,
    level,
    section,
    where: "h2",
    text: `${rule} · почини`,
    count: 1,
  });
  const mark = (
    name: string,
    section: string | null,
    status: "ok" | "broken" | "hidden",
    device = "mobile",
  ) => ({
    mark: name,
    section,
    status,
    text: "кнопка не положила товар: запроса в корзину не было",
    device,
  });
  const snapshot = {
    checks: {
      findings: [
        semantic("empty-heading", "faq-1"),
        semantic("heading-level", "hero-1"),
        semantic("landmark-one-main", null),
      ],
      failed: [
        { place: "browser", check: "semantic", reason: "не успел за 5 с" },
      ],
    },
    marks: {
      ok: true,
      results: [
        mark("add-to-cart", "faq-1", "broken", "mobile"),
        mark("add-to-cart", "faq-1", "broken", "desktop"),
        mark("cart", "header-1", "broken"),
        mark("search", "faq-1", "ok"),
      ],
    },
    images: ["…"],
  };

  it("секции: семантика и сломанные метки только их; метка на двух устройствах — одна строка ×2, ошибка", () => {
    const taken = findingsOf(
      { page: "home", take: { kind: "sections", ids: ["faq-1"] } },
      snapshot,
    );
    expect(taken.findings).toEqual([
      semantic("empty-heading", "faq-1"),
      {
        place: "browser",
        check: "marks",
        rule: "add-to-cart",
        level: "error",
        section: "faq-1",
        where: "метка add-to-cart",
        text: "кнопка не положила товар: запроса в корзину не было · почини секцию или убери метку",
        count: 2,
      },
    ]);
    expect(taken.failed).toEqual([
      { place: "browser", check: "semantic", reason: "не успел за 5 с" },
    ]);
  });

  it("вся страница — всё; правила страницы — порядок заголовков и находки без секции, меток нет", () => {
    const all = findingsOf({ page: "home", take: { kind: "all" } }, snapshot);
    expect(all.findings.map((item) => item.rule)).toEqual([
      "empty-heading",
      "heading-level",
      "landmark-one-main",
      "add-to-cart",
      "cart",
    ]);
    const rules = findingsOf(
      { page: "home", take: { kind: "page-rules" } },
      snapshot,
    );
    expect(rules.findings.map((item) => item.rule)).toEqual([
      "heading-level",
      "landmark-one-main",
    ]);
  });

  it("метки не отработали — «не проверено»; снимок не по форме — сбой проверки, а не «находок нет»", () => {
    const failedMarks = findingsOf(
      { page: "home", take: { kind: "all" } },
      { marks: { ok: false, reason: "страница не открылась" } },
    );
    expect(failedMarks).toEqual({
      findings: [],
      failed: [
        {
          place: "browser",
          check: "marks",
          reason: "home: страница не открылась",
        },
      ],
    });
    expect(
      findingsOf(
        { page: "home", take: { kind: "all" } },
        { checks: { findings: "нет" } },
      ).failed,
    ).toEqual([
      {
        place: "browser",
        check: "look",
        reason: "home: ответ снимка не по форме",
      },
    ]);
  });
});
