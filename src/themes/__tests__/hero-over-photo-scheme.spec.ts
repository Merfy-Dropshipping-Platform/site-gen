/**
 * Сторож бага тестера 2026-09-15: «в секции „Изображение“ (Hero) у bloom и satin
 * заголовок и текст лежат поверх фоновой фотографии и ЗАШИТЫ БЕЛЫМ — цветовая
 * схема на них не влияет».
 *
 * ЗАМЕР «ДО» (Chromium, реальный CSS темы + токены схем из theme.json, окна 1440
 * и 375, заголовок Hero поверх фото):
 *              scheme-1          scheme-2          scheme-3          scheme-4
 *   rose       rgb(0,0,0)        rgb(18,18,18)     rgb(26,26,26)     rgb(255,255,255)
 *   bloom      rgb(255,255,255)  rgb(255,255,255)  rgb(255,255,255)  rgb(255,255,255)
 *   satin      rgb(255,255,255)  rgb(255,255,255)  rgb(255,255,255)  rgb(255,255,255)
 * У bloom и satin одно и то же белое при ЛЮБОЙ схеме, у rose — цвет схемы.
 *
 * РЕШЕНИЕ ВЛАДЕЛЬЦА: «как в rose». Механизм rose переносится целиком:
 *   ЦВЕТ решает схема (--color-heading / --color-text, белое — только фолбэк
 *   переменной), ЧИТАЕМОСТЬ держит ЗАТЕМНЕНИЕ (градиент над фото + ползунок
 *   «Затемнение»). Дом правила один — packages/theme-base/styles/hero-over-photo.css,
 *   подключается из global.css темы; своих литералов цвета у портов нет.
 *
 * ЗАМЕР «ПОСЛЕ» (те же клетки): bloom scheme-1/2 → 255,255,255; scheme-3/4 →
 * 0,0,0. satin scheme-1/3 → 0,0,0; scheme-2 → 18,18,18; scheme-4 → 255,255,255.
 * rose, vanilla и flux — ни одной сдвинутой клетки (30/24/24 из 30/24/24).
 *
 * Браузера здесь нет (в CI его нет вовсе), поэтому цвет считается из тех же двух
 * артефактов, из которых его собирает браузер: класс из ЖИВОГО рендера секции +
 * `dist/theme-css/<тема>.css` + `buildTokensCss(settings, тема)`.
 *
 * Рендер требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf8");

const SHARED_CSS = "packages/theme-base/styles/hero-over-photo.css";
const HEADING_CLASS = "hero-over-photo-heading";
const TEXT_CLASS = "hero-over-photo-text";

/** Фото мерчанта: включает ветку «контент поверх фото» там, где она есть. */
const PHOTO = "/images/hero-merchant.png";

type Theme = "rose" | "bloom" | "satin" | "vanilla" | "flux";

function renderHero(
  theme: Theme,
  scheme: string,
  withPhoto: boolean,
  extra: Record<string, unknown> = {},
): string {
  const props: Record<string, unknown> = { id: "Hero-1", colorScheme: scheme, ...extra };
  if (withPhoto) {
    props.backgroundImages = { url1: PHOTO };
    props.heading = { text: "Заголовок героя", size: "large" };
    props.text = { content: "Поясняющий текст героя", size: "large" };
    props.primaryButton = { text: "В каталог", link: { href: "/catalog" } };
  }
  const jobs = [{ block: "Hero", props, live: true, cascade: true }];
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(out) as Record<string, string>[])[0];
  if (typeof row.html !== "string") {
    throw new Error(`рендер Hero (${theme}) не дал HTML: ${JSON.stringify(row)}`);
  }
  return row.html;
}

/** Классы узла: `h1#hero-title` и первый `<p>` секции (поясняющий текст). */
function heroClasses(html: string): { heading: string[]; text: string[] } {
  const h1 = /<h1[^>]*id="hero-title"[^>]*>/.exec(html)?.[0];
  if (!h1) throw new Error("в разметке Hero нет h1#hero-title");
  const p = /<p[^>]*data-puck-subsection-field="text"[^>]*>/.exec(html)?.[0];
  if (!p) throw new Error("в разметке Hero нет <p> поля «Текст»");
  const cls = (tag: string) =>
    (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);
  return { heading: cls(h1), text: cls(p) };
}

/**
 * Утилиты, которые ЗАДАЮТ ЦВЕТ текста (а не кегль). `text-[14px]` и
 * `text-[length:var(--x)]` — размеры, они здесь законны.
 */
const COLOR_UTILITY =
  /^!?text-(white|black|current|transparent|\[(?:rgb|#|color:|oklch|hsl))/;
const colorUtilitiesOf = (classes: string[]) =>
  classes.filter((c) => COLOR_UTILITY.test(c.split("/")[0]));

/** Значение токена схемы из скомпилированных `.color-scheme-N { … }`. */
function tokenValue(tokensCss: string, schemeId: string, token: string): string {
  const n = schemeId.replace("scheme-", "");
  const body = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? "";
  const value = new RegExp(`${token}:\\s*([^;]+)`).exec(body)?.[1]?.trim();
  if (!value) throw new Error(`токен ${token} не объявлен у ${schemeId}`);
  return value;
}

/** Цвет, который подставит браузер: правило общего слоя + токен схемы. */
function resolvedColor(themeCss: string, tokensCss: string, cls: string, schemeId: string) {
  const rule = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(themeCss);
  if (!rule) throw new Error(`в CSS темы нет правила .${cls} — нужен pnpm build:theme-sections`);
  const decl = /(?:^|[;{\s])color:\s*rgb\(var\((--[a-z0-9-]+)\s*,\s*([^)]*)\)\)/i.exec(rule[1]);
  if (!decl) throw new Error(`.${cls} не объявляет color через переменную схемы: ${rule[1]}`);
  return { token: decl[1], fallback: decl[2].trim(), rgb: tokenValue(tokensCss, schemeId, decl[1]) };
}

const themeCssOf = (theme: Theme) => {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) throw new Error(`нет ${path} — нужен pnpm build:theme-sections:all`);
  return readFileSync(path, "utf8");
};

const schemesOf = (theme: Theme): string[] =>
  (JSON.parse(read(`packages/theme-${theme}/theme.json`)).colorSchemes as { id: string }[]).map(
    (s) => s.id,
  );

// ── 1. Дом правила один, и он говорит ровно то же, что литерал rose ─────────

describe("правило «цвет поверх фото» живёт в одном месте", () => {
  const shared = read(SHARED_CSS);

  it("общий CSS объявляет заголовок от --color-heading с белым фолбэком", () => {
    expect(shared).toMatch(
      new RegExp(`\\.${HEADING_CLASS}\\s*\\{[^}]*color:\\s*rgb\\(var\\(--color-heading,\\s*255 255 255\\)\\)`),
    );
  });

  it("общий CSS объявляет текст от --color-text с белым фолбэком", () => {
    expect(shared).toMatch(
      new RegExp(`\\.${TEXT_CLASS}\\s*\\{[^}]*color:\\s*rgb\\(var\\(--color-text,\\s*255 255 255\\)\\)`),
    );
  });

  it("эталон rose не съехал: порт печатает ТЕ ЖЕ два токена с тем же фолбэком", () => {
    // Пин эталона (паттерн «старая цена» из product-section-colors.spec.ts).
    // Сдвинут rose — тест краснеет здесь, и общий слой обязан поехать следом,
    // а не разойтись с ним молча.
    const rose = read("themes/rose/src/components/sections/Hero.astro");
    expect(rose).toContain("text-[rgb(var(--color-heading,255_255_255))]");
    expect(rose).toContain("text-[rgb(var(--color-text,255_255_255))]");
  });

  it("правило НЕ important — ветка «Контейнер» обязана его перебивать", () => {
    // Комментарий файла слово `!important` упоминает, поэтому смотрим на
    // объявления, а не на весь текст.
    const declarations = shared.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).toContain(HEADING_CLASS);
    expect(declarations).not.toContain("!important");
  });
});

// ── 2. bloom и satin: цвет поверх фото идёт от схемы ────────────────────────

const OVER_PHOTO: { theme: Theme; withPhoto: boolean; где: string }[] = [
  { theme: "bloom", withPhoto: true, где: "фото мерчанта на всю секцию" },
  { theme: "satin", withPhoto: false, где: "плейсхолдер landscape-image.png" },
];

describe.each(OVER_PHOTO)("Hero поверх фото / $theme ($где)", ({ theme, withPhoto }) => {
  const schemes = schemesOf(theme);

  it("заголовок и текст несут класс общего слоя и НИ ОДНОЙ своей краски", () => {
    const { heading, text } = heroClasses(renderHero(theme, schemes[0], withPhoto));
    expect(heading).toContain(HEADING_CLASS);
    expect(text).toContain(TEXT_CLASS);
    // Саботаж «вернули !text-white» ловится здесь: своя утилита цвета запрещена.
    expect(colorUtilitiesOf(heading)).toEqual([]);
    expect(colorUtilitiesOf(text)).toEqual([]);
  });

  it.each(schemes)("%s: цвет заголовка = «Заголовок» схемы, а не белый литерал", (scheme) => {
    const themeCss = themeCssOf(theme);
    const tokensCss = buildTokensCss({}, theme);
    const { heading } = heroClasses(renderHero(theme, scheme, withPhoto));
    expect(heading).toContain(HEADING_CLASS);
    const got = resolvedColor(themeCss, tokensCss, HEADING_CLASS, scheme);
    expect(got.token).toBe("--color-heading");
    expect(got.rgb).toBe(tokenValue(tokensCss, scheme, "--color-heading"));
  });

  it.each(schemes)("%s: цвет текста = «Текст» схемы", (scheme) => {
    const themeCss = themeCssOf(theme);
    const tokensCss = buildTokensCss({}, theme);
    const { text } = heroClasses(renderHero(theme, scheme, withPhoto));
    expect(text).toContain(TEXT_CLASS);
    const got = resolvedColor(themeCss, tokensCss, TEXT_CLASS, scheme);
    expect(got.token).toBe("--color-text");
    expect(got.rgb).toBe(tokenValue(tokensCss, scheme, "--color-text"));
  });

  it("схема РЕАЛЬНО двигает цвет: светлая и тёмная дают разные числа", () => {
    // Тот самый баг: до правки все схемы давали 255 255 255. Проверяем не
    // «класс есть», а что числа по схемам различаются.
    const tokensCss = buildTokensCss({}, theme);
    const values = new Set(schemes.map((s) => tokenValue(tokensCss, s, "--color-heading")));
    expect(values.size).toBeGreaterThan(1);
    const themeCss = themeCssOf(theme);
    const rendered = new Set(
      schemes.map((s) => resolvedColor(themeCss, tokensCss, HEADING_CLASS, s).rgb),
    );
    expect([...rendered].sort()).toEqual([...values].sort());
  });
});

// ── 3. Затемнение приехало вместе с цветом ──────────────────────────────────

describe("читаемость: тёмный слой между фото и текстом на месте", () => {
  it("bloom с фото: постоянный градиент from-black/45 to-black/10", () => {
    expect(renderHero("bloom", "scheme-3", true)).toContain("from-black/45 to-black/10");
  });

  // Ползунок выставлен явно: по умолчанию у bloom затемнения нет (0, как у
  // верстальщиков, владелец 24.09), проверяем, что сам ползунок работает.
  it("bloom: ползунок «Затемнение» по-прежнему рисует чёрный слой", () => {
    const html = renderHero("bloom", "scheme-3", true, { overlay: 40 });
    expect(html).toMatch(/absolute inset-0 z-\[1\] bg-black/);
  });

  it("satin, плейсхолдер: градиент from-black/30 to-black/45", () => {
    expect(renderHero("satin", "scheme-3", false)).toContain("from-black/30 to-black/45");
  });

  it("rose, эталон: его собственный градиент не тронут", () => {
    expect(renderHero("rose", "scheme-3", false)).toContain("from-black/45 to-black/10");
  });
});

// ── 4. Контроль незатронутого: rose, vanilla, flux ──────────────────────────

describe("общий слой подключён АДРЕСНО и никуда не протёк", () => {
  it.each(["bloom", "satin"] as Theme[])("%s подключает общий CSS", (theme) => {
    expect(read(`themes/${theme}/src/styles/global.css`)).toContain(
      "packages/theme-base/styles/hero-over-photo.css",
    );
  });

  it.each(["rose", "vanilla", "flux"] as Theme[])("%s НЕ подключает его", (theme) => {
    // Первая редакция правки клала класс Tailwind в packages/theme-base/blocks/*.ts.
    // Все пять тем сканируют этот каталог, а у vanilla нет @source на свои
    // компоненты — утилита впервые попала в vanilla.css и сдвинула заголовок
    // vanilla с rgb(10,10,10) на цвет схемы в 24 клетках из 24. Сторож на это.
    expect(read(`themes/${theme}/src/styles/global.css`)).not.toContain("hero-over-photo");
  });

  it.each(["rose", "vanilla", "flux"] as Theme[])("%s: правила нет и в собранном CSS", (theme) => {
    expect(themeCssOf(theme)).not.toContain(HEADING_CLASS);
  });

  it.each(["rose", "vanilla", "flux"] as Theme[])("%s: Hero не берёт классы общего слоя", (theme) => {
    const { heading, text } = heroClasses(renderHero(theme, schemesOf(theme)[0], true));
    expect(heading).not.toContain(HEADING_CLASS);
    expect(text).not.toContain(TEXT_CLASS);
  });
});
