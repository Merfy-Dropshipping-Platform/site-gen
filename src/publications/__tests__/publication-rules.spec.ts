import {
  assertTransition,
  autoExcerpt,
  canTransition,
  optionalText,
  parseScheduledAt,
  parseStatus,
  plainText,
  publicationPath,
  requireFutureSchedule,
  requireTitle,
  slugify,
  validateSlug,
  type PublicationStatus,
} from "../publication-rules";
import { PublicationError } from "../publications.errors";
import { needsRebuild } from "../publications.service";

function errorOf(fn: () => unknown): PublicationError {
  try {
    fn();
  } catch (e) {
    if (e instanceof PublicationError) return e;
    throw e;
  }
  throw new Error("ожидалась PublicationError");
}

describe("переходы статусов (PUB-4, PUB-7, PUB-8)", () => {
  const ALLOWED: [PublicationStatus, PublicationStatus][] = [
    ["draft", "published"],
    ["draft", "scheduled"],
    ["scheduled", "draft"],
    ["scheduled", "published"],
    ["published", "archived"],
    ["published", "draft"],
    ["archived", "draft"],
  ];
  const FORBIDDEN: [PublicationStatus, PublicationStatus][] = [
    ["draft", "archived"],
    ["scheduled", "archived"],
    ["published", "scheduled"],
    ["archived", "published"],
    ["archived", "scheduled"],
  ];

  it.each(ALLOWED)("%s → %s разрешён", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each(FORBIDDEN)(
    "%s → %s — 409 publication_transition_not_allowed",
    (from, to) => {
      const err = errorOf(() => assertTransition(from, to));
      expect(err.code).toBe("publication_transition_not_allowed");
      expect(err.status).toBe(409);
      expect(err.field).toBe("status");
    },
  );

  it("правка без смены статуса допустима в любом статусе", () => {
    for (const s of ["draft", "scheduled", "published", "archived"] as const) {
      expect(canTransition(s, s)).toBe(true);
    }
  });

  it("текст ошибки published → scheduled — по-русски, как в контракте", () => {
    const err = errorOf(() => assertTransition("published", "scheduled"));
    expect(err.message).toMatch(
      /^Запись в статусе «Опубликована» нельзя поставить в расписание/,
    );
    expect(err.message).toContain("черновики");
  });

  it("подсказки для архива", () => {
    expect(
      errorOf(() => assertTransition("archived", "published")).message,
    ).toContain("из архива");
    expect(
      errorOf(() => assertTransition("draft", "archived")).message,
    ).toContain("только опубликованная");
  });
});

describe("автоанонс (PUB-12)", () => {
  it("заданный продавцом анонс — как есть", () => {
    expect(autoExcerpt("<p>текст</p>", "Мой анонс")).toBe("Мой анонс");
  });

  it("null/пусто — текст без HTML", () => {
    expect(autoExcerpt("<p>Привет, <b>мир</b>!</p>", null)).toBe(
      "Привет, мир!",
    );
    expect(autoExcerpt("<p>Коротко</p>", "   ")).toBe("Коротко");
    expect(autoExcerpt("", null)).toBe("");
  });

  it("длинный текст режется по границе слова до 200 знаков, с «…»", () => {
    const words = Array.from({ length: 60 }, (_, i) => `слово${i}`).join(" ");
    const result = autoExcerpt(`<p>${words}</p>`, null);
    expect(result.endsWith("…")).toBe(true);
    const body = result.slice(0, -1);
    expect(body.length).toBeLessThanOrEqual(200);
    // Последнее слово целое — есть в исходном тексте как отдельное слово.
    const last = body.split(" ").pop()!;
    expect(words.split(" ")).toContain(last);
  });

  it("обрыв ровно на пробеле — слово не теряется", () => {
    const text = `${"a".repeat(199)}b ccc`;
    expect(autoExcerpt(text, null)).toBe(`${"a".repeat(199)}b…`);
  });

  it("одно длинное слово — режется по знаку", () => {
    expect(autoExcerpt("x".repeat(300), null)).toBe(`${"x".repeat(200)}…`);
  });

  it("знаки препинания перед «…» снимаются", () => {
    const text = `${"слово ".repeat(32)}конец, ${"хвост ".repeat(20)}`;
    expect(autoExcerpt(text, null)).not.toMatch(/[,.\s]…$/);
  });

  it("plainText сжимает пробелы и &nbsp;", () => {
    expect(plainText("<p>a&nbsp;b</p>\n<p>c</p>")).toBe("a b c");
  });
});

describe("адрес записи (PUB-10)", () => {
  it("slugify: транслит, дефисы, без дефисов по краям", () => {
    expect(slugify("Привет, мир!")).toBe("privet-mir");
    expect(slugify("  --Ёлка 2025--  ")).toBe("yolka-2025");
    expect(slugify("!!!")).toBe("");
  });

  it("validateSlug принимает латиницу, цифры и дефис между ними", () => {
    expect(validateSlug("moya-zapis-2")).toBe("moya-zapis-2");
  });

  it.each(["Moya", "moya_zapis", "-moya", "moya-", "moya--zapis", "моя", ""])(
    "validateSlug(%p) — 400 validation_failed, field slug",
    (value) => {
      const err = errorOf(() => validateSlug(value));
      expect(err.code).toBe("validation_failed");
      expect(err.status).toBe(400);
      expect(err.field).toBe("slug");
    },
  );

  it("validateSlug: длиннее 200 — 400", () => {
    expect(errorOf(() => validateSlug("a".repeat(201))).field).toBe("slug");
  });

  it("адрес блога проверяется с field handle", () => {
    const err = errorOf(() => validateSlug("Bad Handle", "handle"));
    expect(err.field).toBe("handle");
    expect(err.message).toContain("Адрес блога");
  });

  it("publicationPath — /blogs/{handle}/{slug}", () => {
    expect(publicationPath("novosti", "otkrytie")).toBe(
      "/blogs/novosti/otkrytie",
    );
  });
});

describe("проверки полей (PUB-10, PUB-11)", () => {
  it("пустой заголовок — 400 title", () => {
    const err = errorOf(() => requireTitle("   "));
    expect([err.code, err.status, err.field]).toEqual([
      "validation_failed",
      400,
      "title",
    ]);
  });

  it("пустое название нового блога — 400 newBlogTitle", () => {
    const err = errorOf(() => requireTitle("", "newBlogTitle"));
    expect(err.field).toBe("newBlogTitle");
    expect(err.message).toBe("Укажите название блога.");
  });

  it("слишком длинный заголовок — 400", () => {
    expect(errorOf(() => requireTitle("a".repeat(256))).field).toBe("title");
  });

  it("optionalText: undefined — не трогать, null/пусто — null, предел длины", () => {
    expect(optionalText(undefined, "seoTitle", 70, "SEO")).toBeUndefined();
    expect(optionalText(null, "seoTitle", 70, "SEO")).toBeNull();
    expect(optionalText("  ", "seoTitle", 70, "SEO")).toBeNull();
    expect(optionalText("ok", "seoTitle", 70, "SEO")).toBe("ok");
    const err = errorOf(() =>
      optionalText("a".repeat(71), "seoTitle", 70, "SEO-заголовок"),
    );
    expect([err.field, err.status]).toEqual(["seoTitle", 400]);
    expect(err.message).toContain("70");
    expect(errorOf(() => optionalText(5, "excerpt", 500, "Анонс")).field).toBe(
      "excerpt",
    );
  });

  it("parseStatus: неизвестный статус — 400", () => {
    expect(parseStatus(undefined)).toBeUndefined();
    expect(parseStatus("archived")).toBe("archived");
    expect(errorOf(() => parseStatus("deleted")).field).toBe("status");
  });

  it("parseScheduledAt и requireFutureSchedule", () => {
    const now = new Date("2026-10-20T10:00:00.000Z");
    expect(parseScheduledAt(undefined)).toBeUndefined();
    expect(parseScheduledAt(null)).toBeNull();
    expect(parseScheduledAt("")).toBeNull();
    expect(errorOf(() => parseScheduledAt("вчера")).field).toBe("scheduledAt");
    expect(errorOf(() => parseScheduledAt(123)).field).toBe("scheduledAt");
    const future = parseScheduledAt("2026-10-20T11:00:00.000Z")!;
    expect(requireFutureSchedule(future, now)).toBe(future);
    expect(errorOf(() => requireFutureSchedule(null, now)).field).toBe(
      "scheduledAt",
    );
    const past = errorOf(() =>
      requireFutureSchedule(new Date("2026-10-20T09:59:00.000Z"), now),
    );
    expect([past.code, past.status, past.field]).toEqual([
      "validation_failed",
      400,
      "scheduledAt",
    ]);
  });
});

describe("пересборка (PUB-5)", () => {
  const base = {
    id: "p",
    organizationId: "o",
    siteId: "s",
    blogId: "b",
    title: "T",
    slug: "t",
    content: "c",
    excerpt: null,
    seoTitle: null,
    seoDescription: null,
    coverImageUrl: null,
    status: "published" as const,
    scheduledAt: null,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it.each([
    ["title", "T2"],
    ["content", "c2"],
    ["excerpt", "e"],
    ["coverImageUrl", "u"],
    ["slug", "t2"],
    ["blogId", "b2"],
    ["seoTitle", "s"],
    ["seoDescription", "d"],
  ])("у опубликованной записи изменилось %s → пересборка", (field, value) => {
    expect(
      needsRebuild(base, { ...base, [field]: value }, "published", "published"),
    ).toBe(true);
  });

  it("ничего видимого не изменилось — без пересборки", () => {
    expect(
      needsRebuild(
        base,
        { ...base, updatedAt: new Date(0) },
        "published",
        "published",
      ),
    ).toBe(false);
  });

  it("правка черновика — без пересборки", () => {
    const draft = { ...base, status: "draft" as const };
    expect(
      needsRebuild(draft, { ...draft, title: "x" }, "draft", "draft"),
    ).toBe(false);
  });

  it.each([
    ["draft", "published", true],
    ["scheduled", "published", true],
    ["published", "draft", true],
    ["published", "archived", true],
    ["archived", "draft", false],
    ["draft", "scheduled", false],
    ["scheduled", "draft", false],
  ] as const)("%s → %s: пересборка %s", (from, to, expected) => {
    expect(needsRebuild(base, base, from, to)).toBe(expected);
  });
});
