/**
 * Промо-баннер: подпись ссылки и регистр текста — пять тем.
 *
 * Баг тестировщика (2026-09-13): «Не изменяется ссылка, всегда стоит
 * "подробнее"». Причина — в конструкторе (подпанель «Объявление» роняла
 * подпись из пикера, см. constructor/src/components/fields/CustomFieldsPanel.tsx).
 * Порты тем подпись читают правильно, и этот тест держит их такими: любая
 * будущая правка, которая снова захардкодит «Подробнее» в полосе, упадёт здесь.
 *
 * Второе требование владельца по той же секции: «Брать текст из инпута в
 * параметре Объявление, не делать прописные капсом нигде». Дефолт регистра
 * обязан быть «как введено»; явный выбор мерчанта «Заглавными» — работает.
 * До правки vanilla/satin/bloom капсовали и БЕЗ пропа, и по blockDefaults.
 *
 * Рендерим РОВНО тот модуль, который тема отдаёт на витрину и в превью
 * (dist/theme-sections/<тема>/manifest.json) — как section-html-snapshot.spec.
 * Требует собранных секций: pnpm build:theme-sections:all
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const base = {
  id: "PromoBanner-1",
  colorScheme: "1",
  padding: { top: 0, bottom: 0 },
  text: "Скидка Недели",
};

/** Подписи намеренно разные и непохожие на дефолт — «Подробнее» тут провал. */
const LABELS = ["Читать правила", "Контакты", "Доставка и оплата"];

type Job = { block: string; props: Record<string, unknown> };

const JOBS: Job[] = [
  // 0..2 — подпись ссылки: ровно то, что задал мерчант.
  ...LABELS.map((label) => ({
    block: "PromoBanner",
    props: { ...base, link: { text: label, href: "/delivery" } },
  })),
  // 3 — адрес ссылки следует за выбранной страницей.
  {
    block: "PromoBanner",
    props: { ...base, link: { text: "Контакты", href: "/contacts" } },
  },
  // 4 — регистр НЕ задан: дефолт «как введено», капса быть не должно.
  {
    block: "PromoBanner",
    props: { ...base, link: { text: "Читать правила", href: "/delivery" } },
  },
  // 5 — мерчант явно выбрал «Как введено».
  {
    block: "PromoBanner",
    props: {
      ...base,
      textTransform: "none",
      link: { text: "Читать правила", href: "/delivery" },
    },
  },
  // 6 — мерчант явно выбрал «Заглавными»: настройка обязана работать.
  {
    block: "PromoBanner",
    props: {
      ...base,
      textTransform: "uppercase",
      link: { text: "Читать правила", href: "/delivery" },
    },
  },
];

const NBSP = String.fromCharCode(160);

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .split(NBSP)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function anchorLabel(html: string): string | null {
  const m = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/);
  return m ? plain(m[1]) : null;
}

function anchorHref(html: string): string | null {
  const m = html.match(/<a\b[^>]*href="([^"]*)"/);
  return m ? m[1] : null;
}

/** Капс ищем только в class-атрибутах — текст комментариев не в счёт. */
function hasUppercaseClass(html: string): boolean {
  return (html.match(/class="[^"]*"/g) ?? []).some((c) =>
    /\buppercase\b/.test(c),
  );
}

function renderTheme(theme: string): string[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(JOBS)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as {
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  return rows.map((r) => {
    if (r.missing) throw new Error("в теме нет секции PromoBanner");
    if (r.error) throw new Error(`ОШИБКА РЕНДЕРА: ${r.error}`);
    return r.html ?? "";
  });
}

describe.each(THEMES)("промо-баннер — %s", (theme) => {
  const manifest = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  const built = existsSync(manifest);
  let html: string[];

  beforeAll(() => {
    if (built) html = renderTheme(theme);
  }, 120_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it.each(LABELS.map((l, i) => [l, i] as const))(
    "подпись ссылки = «%s», а не дефолтное «Подробнее»",
    (label, i) => {
      if (!built) return;
      expect(anchorLabel(html[i])).toBe(label);
      expect(plain(html[i])).not.toContain("Подробнее");
    },
  );

  it("адрес ссылки — выбранная страница", () => {
    if (!built) return;
    expect(anchorHref(html[3])).toBe("/contacts");
    expect(anchorLabel(html[3])).toBe("Контакты");
  });

  it("регистр НЕ задан → капса нет (дефолт «как введено»)", () => {
    if (!built) return;
    expect(hasUppercaseClass(html[4])).toBe(false);
    expect(plain(html[4])).toContain("Скидка Недели");
  });

  it("регистр «Как введено» → капса нет", () => {
    if (!built) return;
    expect(hasUppercaseClass(html[5])).toBe(false);
  });

  it("регистр «Заглавными» → капс есть (настройка жива)", () => {
    if (!built) return;
    expect(hasUppercaseClass(html[6])).toBe(true);
  });

  it("theme.json не капсует промо-баннер по умолчанию", () => {
    const themeJson = JSON.parse(
      readFileSync(
        resolve(SITES_ROOT, "packages", `theme-${theme}`, "theme.json"),
        "utf-8",
      ),
    ) as { blockDefaults?: Record<string, { textTransform?: string }> };
    const promo = themeJson.blockDefaults?.PromoBanner;
    expect(promo?.textTransform ?? "none").toBe("none");
  });
});
