/**
 * «Заказы» и «Личный кабинет»: приглушённый текст обязан приходить из ЖИВОГО
 * токена схемы.
 *
 * Тестировщик (пункты 13 и 14 репорта): «не применяется цветовая схема к кнопке
 * и тексту». Замер объяснил, почему. Секции и вёрстка страниц аккаунта красят
 * текст через `rgb(var(--color-text-muted))`, а такого токена НЕТ: его не
 * объявляет ни buildTokensCss (белый список ROOT_RULES_EXPLICIT в
 * src/themes/tokens-css.ts), ни правила схем `.color-scheme-N`. Живой замер
 * 2026-09-15 по пяти стендам: на `/account/orders` токен использован 18 раз
 * (16 в CSS темы + 2 в HTML секции), ОБЪЯВЛЕН 0 раз. `rgb(var(--НЕТ))` — это
 * «invalid at computed-value time»: свойство обнуляется, цвет достаётся
 * наследованием, и схема на него не влияет вообще.
 *
 * Живой и различимый по схемам токен — `--color-muted` (замер тех же стендов:
 * satin 98/102/113/200, flux 106/108/145/157). Эталон применения — rose:
 * `rgb(var(--color-muted, 153 153 153))` (ProductCard, Footer, CartSection,
 * Newsletter — 54 вхождения в themes/rose/src).
 *
 * Границы проверки, чтобы её не расширили молча:
 *   • правила `.auth-*`, живущие ТОЛЬКО на странице входа (`.auth-link-muted`,
 *     `.auth-helper`, `.auth-otp-cell`, `.auth-eye-toggle`), здесь НЕ трогаются:
 *     их контейнер `.auth-shell` объявляет `--color-text-muted` локально, токен
 *     там жив, и страница входа — предмет другой ветки;
 *   • `.auth-input` рисуется в ОБОИХ местах (форма профиля в AccountSection
 *     помечает инпуты этим классом), поэтому от него требуется не замена, а
 *     ЦЕПОЧКА фолбэков: локальное значение страницы входа остаётся, а на
 *     странице аккаунта подхватывается схема.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Мёртвый токен: не объявлен ни схемами, ни buildTokensCss. */
const DEAD = "--color-text-muted";
/** Живой токен схемы. */
const ALIVE = "--color-muted";

const themeFile = (theme: string, rel: string) =>
  resolve(SITES_ROOT, "themes", theme, "src", rel);

const render = (theme: string, block: string): string => {
  const mf = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  if (!existsSync(mf)) return "";
  const rows = JSON.parse(
    execFileSync(
      "node",
      [
        RENDERER,
        theme,
        JSON.stringify([{ block, props: { id: `${block}-1` } }]),
      ],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  expect(rows[0]?.error).toBeUndefined();
  expect(rows[0]?.missing).toBeFalsy();
  return rows[0]?.html ?? "";
};

/**
 * Комментарии вырезаются ДО любого разбора CSS.
 *
 * Иначе разборщик читает прозу как код: комментарий соседней ветки упоминал
 * `.auth-input` и строкой ниже `--color-text-muted`, и регулярка правил
 * склеила из них несуществующее правило с мёртвым токеном — гард покраснел на
 * тексте, которого браузер не видит (2026-09-15).
 */
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Вырезает из global.css темы правила, чьи селекторы начинаются с `.account-`.
 * Именно они рисуют обе секции аккаунта и страницу заказа; правила `.auth-*`
 * сюда не попадают намеренно (см. шапку файла).
 */
const accountRules = (css: string): string[] => {
  const out: string[] = [];
  // Якоря `(^|\})` здесь нет намеренно: он заставляет регулярку требовать
  // закрывающую скобку ПЕРЕД каждым правилом и она читает файл ЧЕРЕЗ ОДНО —
  // видно было 23 правила `.account-*` из 46 в каждой теме. Саботаж это
  // показал: мёртвый токен, возвращённый в `.account-back-link`, оставлял
  // гард зелёным (2026-09-15). Без якоря регулярка доходит и до правил,
  // вложенных в `@media`.
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(css)))) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    if (/(^|,)\s*\.account-/.test(selector)) out.push(`${selector}{${m[2]}}`);
  }
  return out;
};

describe("секции аккаунта — приглушённый текст берётся из живого токена схемы", () => {
  it.each(THEMES)("%s: «Заказы» не красят текст мёртвым токеном", (theme) => {
    const html = render(theme, "OrdersSection");
    if (!html) return;
    const dead = html.split(DEAD).length - 1;
    expect(`${theme}: вхождений ${DEAD} в разметке = ${dead}`).toBe(
      `${theme}: вхождений ${DEAD} в разметке = 0`,
    );
    expect(html).toContain(`var(${ALIVE}`);
  });

  it.each(THEMES)(
    "%s: «Личный кабинет» не красит текст мёртвым токеном",
    (theme) => {
      const html = render(theme, "AccountSection");
      if (!html) return;
      const dead = html.split(DEAD).length - 1;
      expect(`${theme}: вхождений ${DEAD} в разметке = ${dead}`).toBe(
        `${theme}: вхождений ${DEAD} в разметке = 0`,
      );
      expect(html).toContain(`var(${ALIVE}`);
    },
  );
});

describe("вёрстка страниц аккаунта — тот же живой токен", () => {
  it.each(THEMES)(
    "%s: ни одно правило .account-* не висит на мёртвом токене",
    (theme) => {
      const css = readFileSync(themeFile(theme, "styles/global.css"), "utf-8");
      const broken = accountRules(css).filter((r) => r.includes(DEAD));
      expect(
        `${theme}: правил .account-* с ${DEAD} = ${broken.length}${
          broken.length
            ? ` (${broken.map((r) => r.split("{")[0]).join(", ")})`
            : ""
        }`,
      ).toBe(`${theme}: правил .account-* с ${DEAD} = 0`);
    },
  );

  it.each(THEMES)(
    "%s: .auth-input даёт фолбэк на схему (страница входа не меняется)",
    (theme) => {
      const css = readFileSync(themeFile(theme, "styles/global.css"), "utf-8");
      const rules =
        stripComments(css).match(/\.auth-input[^{]*\{[^}]*\}/g) ?? [];
      const withDead = rules.filter((r) => r.includes(DEAD));
      // Правило может опираться на локальный `--color-text-muted` (его объявляет
      // `.auth-shell` страницы входа), но ОБЯЗАНО иметь запасной путь на схему —
      // иначе на странице аккаунта, где `.auth-shell` нет, обводка и подсказка
      // инпута обнуляются.
      const withoutFallback = withDead.filter(
        (r) => !r.includes(`var(${ALIVE}`),
      );
      expect(
        `${theme}: правил .auth-input с ${DEAD} без фолбэка на ${ALIVE} = ${withoutFallback.length}`,
      ).toBe(
        `${theme}: правил .auth-input с ${DEAD} без фолбэка на ${ALIVE} = 0`,
      );
      expect(rules.length).toBeGreaterThan(0);
    },
  );

  it.each(THEMES)(
    "%s: страница заказа не красит текст мёртвым токеном",
    (theme) => {
      const file = themeFile(theme, "pages/account/order.astro");
      if (!existsSync(file)) return;
      const src = readFileSync(file, "utf-8");
      const dead = src.split(DEAD).length - 1;
      expect(`${theme}: вхождений ${DEAD} в order.astro = ${dead}`).toBe(
        `${theme}: вхождений ${DEAD} в order.astro = 0`,
      );
    },
  );
});
