/**
 * Цвета секции «Товар»: счётчик количества и приглушённый текст.
 *
 * Баг-репорт тестировщика 2026-09-13 (магазин 7b64b7a527d2, тема rose):
 *   T5 «Цифра счётчика количества красится цветом ФОНА кнопки». Класс узла —
 *      `text-[rgb(var(--color-button-bg))]`, стрелки «−»/«+» наследуют его же
 *      через `text-current`. В схеме 3 магазина фон секции #71C0FF, фон кнопки
 *      #5AF810 — салатовая цифра на голубом. В схеме 1 совпало случайно (белая
 *      кнопка на чёрном фоне), поэтому баг легко не заметить.
 *   T7 «Описание жёстко серое»: `--color-muted` — в редакторе схемы такого поля
 *      НЕТ (там Фон, Заголовок, Текст и две группы кнопок), значит исправить
 *      мерчанту нечем. Рядом, в этой же секции, старая цена сделана правильно:
 *      `rgb(var(--color-text))/60`.
 *
 * ЗАМЕР «ДО» (chromium, реальный CSS темы + схема тестировщика
 * bg #71C0FF / кнопка #5AF810 / текст #1A1A1A, 2026-09-13):
 *   счётчик   rose/vanilla/satin/bloom → rgb(90,248,16)  = фон кнопки;
 *   описание  rose/satin/bloom → rgb(153,153,153), vanilla → rgb(68,68,68),
 *             flux-примитив → rgb(204,204,204) — во всех случаях значение
 *             `--color-muted`, которое мерчант не может изменить;
 *   бренд-строка — тот же `--color-muted` (и это тот самый «Текст» из T4:
 *             после его починки серый текст стал бы виден впервые);
 *   старая цена → oklab(… / 0.6) — эталон, взят за образец.
 *
 * Здесь браузера нет (в CI его нет вовсе), поэтому цвет считается по тем же
 * двум артефактам, из которых его собирает браузер:
 *   1) `dist/theme-css/<тема>.css` — какая CSS-переменная стоит за утилитой
 *      Tailwind, которую напечатал порт;
 *   2) `buildTokensCss(themeSettings, тема)` — какие ЧИСЛА лежат в этой
 *      переменной у выбранной схемы.
 * Класс берётся из ЖИВОГО рендера секции, а не из исходника: до правки оба
 * порта «читались правильно» и всё равно красили не тем.
 *
 * flux исключён сознательно: у него собственный порт (FeaturedProduct.astro),
 * и его секция «Товар» не следует схеме ВООБЩЕ — цифра счётчика `text-[#1e2952]`,
 * цена `text-[#000000]`, описание `text-[#999999]` вбиты литералами. Это другая
 * болезнь (и другой объём работ), она вынесена в отчёт хвостом; чинить её
 * «заодно» — значит переписать палитру пиксель-перфектного порта.
 *
 * Рендер требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");

/** Четыре темы общего порта theme-base (авторитет — manifest.json тем). */
const THEMES = ["rose", "bloom", "satin", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Схема тестировщика: салатовая кнопка на голубом фоне. */
const SCHEME_3 = {
  id: "scheme-3",
  name: "3",
  background: "#71C0FF",
  surfaceBg: "#FFFFFF",
  heading: "#1A1A1A",
  text: "#1A1A1A",
  primaryButton: { background: "#5AF810", text: "#000000" },
  secondaryButton: { background: "#FFFFFF", text: "#1A1A1A" },
};
const TEXT_RGB = "26 26 26";
const BUTTON_RGB = "90 248 16";

const props = {
  id: "Product-1",
  productId: "",
  colorScheme: "scheme-3",
  padding: { top: 40, bottom: 40 },
  description: { content: "Описание товара", size: "medium" },
  text: { content: "БРЕНД", size: "medium" },
};

function renderLive(theme: Theme): string {
  const jobs = [{ block: "Product", pkg: "theme-base", props, live: true }];
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(out) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Товар» (${theme}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  return row.html;
}

/** Класс-атрибут узла, помеченного data-атрибутом (первый в разметке). */
function classesOf(html: string, marker: string): string[] {
  const tag = new RegExp(`<[a-z0-9]+[^>]*${marker}[^>]*>`, "i").exec(html)?.[0];
  if (!tag) throw new Error(`узел ${marker} в разметке не найден`);
  const cls = /class="([^"]*)"/.exec(tag)?.[1] ?? "";
  return cls.split(/\s+/).filter(Boolean);
}

/** Класс-атрибут первого тега `tag` ВНУТРИ узла с данным маркером. */
function classesInside(html: string, marker: string, tag: string): string[] {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`узел ${marker} в разметке не найден`);
  const inner = new RegExp(`<${tag}[^>]*>`, "i").exec(html.slice(at))?.[0];
  if (!inner) throw new Error(`внутри ${marker} нет <${tag}>`);
  const cls = /class="([^"]*)"/.exec(inner)?.[1] ?? "";
  return cls.split(/\s+/).filter(Boolean);
}

/**
 * Селектор класса ровно в том виде, в каком его печатает Tailwind в CSS-файл.
 * Дефис НЕ экранируется (в файле лежит `--color-text`, а не `\-\-color-text`).
 */
const cssSelectorOf = (cls: string) =>
  `.${cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`)}`;

/** Экранирование готовой строки селектора для поиска регулярным выражением. */
const forRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Цвет узла по РЕАЛЬНОМУ CSS темы + токенам схемы.
 *
 * Проходим классы в обратном порядке (последний выигравший в каскаде — тот, что
 * объявлен ниже; для наших утилит порядок объявления совпадает с порядком в
 * файле), берём первую утилиту, которая объявляет `color:` через переменную.
 * Возвращаем { token, rgb, alpha } — это ровно то, что браузер подставит.
 */
function resolveColor(
  themeCss: string,
  tokensCss: string,
  classes: string[],
): { token: string; rgb: string; alpha: string | null } {
  for (const cls of classes) {
    const rule = new RegExp(
      `${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`,
    ).exec(themeCss);
    if (!rule) continue;
    // Граница объявления обязательна: без неё `border-color: rgb(var(--color-border))`
    // сходит за `color:` (подстрока), и цветом ТЕКСТА объявляется цвет РАМКИ.
    // Поймано 14.09, когда у счётчика rose/bloom/satin появилась плашка своей
    // темы: тест падал «токен --color-border не объявлен у схемы 3», хотя текст
    // красился правильным --color-text.
    const decl = /(?:^|[;{\s])color:\s*rgb\(var\((--[a-z0-9-]+)\)[^)]*\)/i.exec(
      rule[1],
    );
    if (!decl) continue;
    const token = decl[1];
    const scheme = /\.color-scheme-3\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? "";
    const value = new RegExp(`${token}:\\s*([^;]+)`).exec(scheme)?.[1]?.trim();
    if (!value) {
      throw new Error(`токен ${token} не объявлен у схемы 3 в tokens.css`);
    }
    const alpha = /\/(\d+)$/.exec(cls)?.[1] ?? null;
    return { token, rgb: value, alpha };
  }
  throw new Error(
    `ни один класс не объявляет color в CSS темы: ${classes.join(" ")}`,
  );
}

const themeCssOf = (theme: Theme) => {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:theme-sections:all`);
  }
  return readFileSync(path, "utf8");
};

describe.each(THEMES)("«Товар» / %s: цвета внутри схемы", (theme) => {
  const tokens = buildTokensCss({ colorSchemes: [SCHEME_3] }, theme);

  it("T5 цифра счётчика берёт цвет ТЕКСТА, а не фон кнопки", () => {
    const html = renderLive(theme);
    const color = resolveColor(
      themeCssOf(theme),
      tokens,
      classesOf(html, "data-product-counter"),
    );
    expect(color.token).toBe("--color-text");
    expect(color.rgb).toBe(TEXT_RGB);
    expect(color.rgb).not.toBe(BUTTON_RGB);
  });

  it("T5 стрелки «−»/«+» не красятся ФОНОМ кнопки", () => {
    // Проверяется цвет ТЕКСТА стрелок, а не подстрока в атрибуте. У vanilla
    // силуэт счётчика — две залитые плашки (её собственное решение, см.
    // VanillaProductDetail.astro), поэтому в классе кнопки законно стоит
    // `bg-[rgb(var(--color-button-bg))]`, а глиф красится парным
    // `--color-button-text`. Подстроковая проверка «в кнопке нет
    // --color-button-bg» на этом силуэте красная, хотя цвет стрелки верный.
    const html = renderLive(theme);
    const arrows = /<button[^>]*data-counter-action="decrement"[^>]*>/.exec(
      html,
    )?.[0];
    expect(arrows).toBeDefined();
    const classes = (/class="([^"]*)"/.exec(arrows ?? "")?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (classes.includes("text-current")) {
      // Собственного цвета нет — источник один, обёртка счётчика (rose/bloom/satin).
      expect(arrows).not.toContain("text-[rgb(var(--color-button-bg))]");
      return;
    }
    const color = resolveColor(themeCssOf(theme), tokens, classes);
    expect(color.token).not.toBe("--color-button-bg");
    expect(color.rgb).not.toBe(BUTTON_RGB);
  });

  it("T7 описание приглушается от ТЕКСТА прозрачностью, как старая цена", () => {
    const html = renderLive(theme);
    const color = resolveColor(
      themeCssOf(theme),
      tokens,
      classesInside(html, "data-product-description", "p"),
    );
    expect(color.token).toBe("--color-text");
    expect(color.alpha).toBe("60");
  });

  it("T7 старая цена (эталон) не съехала", () => {
    // Образец, на который равняется описание. Если эталон изменят — тест
    // обязан упасть здесь, а не молча разрешить описанию уехать следом.
    const priceOld = readFileSync(
      resolve(
        SITES_ROOT,
        "packages/theme-base/blocks/Product/ProductPrice.astro",
      ),
      "utf8",
    );
    expect(priceOld).toContain("text-[rgb(var(--color-text))]/60");
  });

  it("T7 бренд-строка («Текст» из T4) тоже считается от ТЕКСТА", () => {
    const html = renderLive(theme);
    const color = resolveColor(
      themeCssOf(theme),
      tokens,
      classesOf(html, 'data-puck-subsection-field="text"'),
    );
    expect(color.token).toBe("--color-text");
    expect(color.alpha).toBe("60");
  });

  it("ни описание, ни бренд-строка больше не висят на --color-muted", () => {
    // Мерчанту нечем править этот токен: в редакторе схемы есть Фон, Заголовок,
    // Текст и две группы кнопок — поля «Приглушённый текст» нет. Значит такой
    // узел — снова непоправимый серый.
    //
    // Проверка адресная, а не «нет слова в HTML»: `--color-muted` осознанно
    // остаётся в ДРУГИХ местах секции — плейсхолдер пустой галереи и
    // недоступная опция варианта, где серый и означает «нет данных».
    const html = renderLive(theme);
    expect(
      classesInside(html, "data-product-description", "p").join(" "),
    ).not.toContain("--color-muted");
    expect(
      classesOf(html, 'data-puck-subsection-field="text"').join(" "),
    ).not.toContain("--color-muted");
  });

  it("узость: сама кнопка «в корзину» по-прежнему красится фоном кнопки", () => {
    // Правка убирает цвет кнопки из ЦИФРЫ, а не из кнопки. Если кто-то
    // «причешет» токены дальше и утащит фон у самой CTA — падать здесь.
    const html = renderLive(theme);
    const btn = /<button[^>]*data-product-action="add-to-cart"[^>]*>/.exec(
      html,
    )?.[0];
    expect(btn).toBeDefined();
    expect(btn).toContain("--color-button-bg");
  });

  it("САБОТАЖ: прежний класс описания резолвится в непоправимый серый", () => {
    const color = resolveColor(themeCssOf(theme), tokens, [
      "text-[rgb(var(--color-muted))]",
    ]);
    expect(color.token).toBe("--color-muted");
    expect(color.rgb).not.toBe(TEXT_RGB);
  });
});
