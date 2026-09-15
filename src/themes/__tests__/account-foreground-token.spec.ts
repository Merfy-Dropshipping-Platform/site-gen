/**
 * «Личный кабинет», «Заказы» и метки формы входа: цвет обязан приходить из
 * ЖИВОГО токена цветовой схемы.
 *
 * ПРИРОДА ДОЛГА. Сплошная матрица `pnpm scheme-matrix:bad` выдала 30 клеток с
 * вердиктом `undeclared` — все на `--color-foreground`. Такого токена не
 * существует: его не объявляют ни правила `.color-scheme-N` из
 * `buildTokensCss`, ни CSS тем. Единственное объявление на весь магазин стоит
 * ИНЛАЙНОМ на контейнере `.auth-shell` страницы входа (`LoginSection.astro`,
 * `AuthShell.astro`: `--color-foreground: 0, 0, 0`).
 *
 * ЗАМЕР 2026-09-15 (`scripts/qa/lib`, локальный рендер портов, пять тем,
 * схемы 2↔5, обе различимы и по `--color-text`, и по `--color-heading`):
 *   • «Личный кабинет»/«Заказы» — `getComputedStyle` даёт `--color-foreground`
 *     ПУСТОЙ. `rgb(var(--НЕТ))` — invalid at computed-value time: свойство
 *     обнуляется целиком, цвет достаётся наследованием. Числа были rose
 *     255,255,255 · vanilla 10,10,10 · bloom/satin/flux 0,0,0 на ОБЕИХ схемах,
 *     вердикт зонда «замерла» 25 клеток из 25 — лотерея вместо схемы;
 *   • страница входа — `--color-foreground` = "0, 0, 0" от инлайна предка
 *     (ловушка 22 в `scripts/qa/lib/README.md`: переменную схемы перебивает
 *     ПРЕДОК). То есть там это не мёртвый токен, а прибитый чёрный, и матрица
 *     этого не видит: её `winningVarDecl` читает только правила CSS.
 *
 * ПОЧЕМУ ДВЕ РАЗНЫЕ ПРАВКИ.
 *   • `.auth-label` живёт ТОЛЬКО на входе. Цепочка фолбэков на нём была бы
 *     пустышкой — инлайн `.auth-shell` всё равно победил бы, матрица бы
 *     позеленела, а пиксель остался бы прибитым. Поэтому роль схемы читается
 *     НАПРЯМУЮ. На схеме по умолчанию (2) `--color-text` = 0 0 0 во всех пяти
 *     темах, значит страница входа не двигается ни на один rgb; на остальных
 *     схемах метка наконец едет за выбором мерчанта.
 *   • `.auth-input` рисуется И на входе, И в форме профиля (реестр требует с
 *     него ровно две клетки, и обе — `AccountSection`). Поэтому у него не
 *     замена, а ЦЕПОЧКА `var(--color-foreground, var(--color-text, 0 0 0))`:
 *     на входе выигрывает локальный инлайн, в аккаунте подхватывается схема.
 *     Тот же приём, что у `--color-text-muted` в коммите 59ff9150.
 *
 * ГРАНИЦЫ. Правила `.auth-link`, `.auth-link-muted:hover`, `.auth-otp-cell`,
 * `.auth-eye-toggle:hover` живут только на входе, красятся тем же инлайном
 * `.auth-shell` и здесь НЕ трогаются — это предмет отдельной ветки.
 *
 * ВЫБОР РОЛИ — по эталону rose, признак объективный: `font-family:
 * var(--font-heading)` → `--color-heading` (`.rose-title`,
 * `.rose-heading-plain`, `[data-nt="section-heading"] h2`, заголовок
 * `LoginSection`); `var(--font-body)` → `--color-text` (rose `body { color:
 * rgb(var(--color-text, 0 0 0)) }`).
 *
 * Сборка этому гарду не нужна: он читает исходники тем и живой вывод
 * `buildTokensCss`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Токен, которого не существует ни в одной схеме. */
const DEAD = "--color-foreground";

const themeFile = (theme: string, rel: string) =>
  resolve(SITES_ROOT, "themes", theme, "src", rel);

const globalCss = (theme: string) =>
  readFileSync(themeFile(theme, "styles/global.css"), "utf-8");

type Rule = { selector: string; body: string };

/**
 * Правила «селектор { тело }», включая вложенные в `@media`.
 *
 * Две мины, на которых разборщик врал молча и обе пойманы саботажем:
 *   • комментарий с примером кода («rose `body { color: … }`») отдаёт лишнюю
 *     пару скобок, и дальше по файлу селекторы съезжают — комментарии
 *     вырезаются ДО разбора;
 *   • якорь `(^|\})` заставляет регулярку требовать закрывающую скобку перед
 *     каждым правилом, и она читает файл ЧЕРЕЗ ОДНО: у rose так терялись
 *     ровно `.auth-label` и `.auth-input` (79 правил вместо 170). Якоря нет.
 */
const rules = (css: string): Rule[] => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith("@")) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
};

const accountRules = (css: string): Rule[] =>
  rules(css).filter((r) => /(^|,)\s*\.account-/.test(r.selector));

const selected = (css: string, prefix: string): Rule[] =>
  rules(css).filter((r) => r.selector.split(",").some((s) => s.trim().startsWith(prefix)));

const colorDecl = (body: string): string | null => {
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(body);
  return m ? m[1].trim() : null;
};

/** Все токены, через которые проходит выражение цвета (голова + фолбэки). */
const tokensOf = (expr: string): string[] =>
  [...expr.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)].map((m) => m[1]);

/**
 * Что объявляют мерчантские схемы `.color-scheme-N`. Список НЕ хардкодится:
 * берётся из живого вывода `buildTokensCss` — ровно того кода, который печатает
 * `tokens.css` витрине. Именно на этом шаге и ломался `--color-foreground`.
 */
const schemeTokens = (theme: string): Set<string> => {
  const css = buildTokensCss(
    {
      colorSchemes: [
        {
          id: "scheme-2",
          name: "2",
          background: "#ffffff",
          surfaceBg: "#fbfbfb",
          heading: "#000000",
          text: "#000000",
          muted: "#666666",
          accent: "#111111",
          primaryButton: { background: "#000000", text: "#ffffff", border: "#000000" },
          secondaryButton: { background: "#ffffff", text: "#000000", border: "#000000" },
        },
      ],
    },
    theme,
  );
  const rule = /\.color-scheme-2(?![\d-])\s*\{([^}]*)\}/.exec(css);
  expect(rule).not.toBeNull();
  return new Set(
    [...(rule as RegExpExecArray)[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]),
  );
};

describe("аккаунт и метки входа — цвет из живого токена схемы", () => {
  it.each(THEMES)("%s: ни одно правило .account-* не висит на мёртвом токене", (theme) => {
    const broken = accountRules(globalCss(theme)).filter((r) => r.body.includes(DEAD));
    expect(
      `${theme}: правил .account-* с ${DEAD} = ${broken.length}` +
        (broken.length ? ` (${broken.map((r) => r.selector).join(", ")})` : ""),
    ).toBe(`${theme}: правил .account-* с ${DEAD} = 0`);
    // Знаменатель: правила вообще нашлись, иначе проверка пустая.
    expect(accountRules(globalCss(theme)).length).toBeGreaterThan(10);
  });

  it.each(THEMES)("%s: каждая краска аккаунта и метки входа доходит до роли схемы", (theme) => {
    const css = globalCss(theme);
    const declared = schemeTokens(theme);
    const watched = [...accountRules(css), ...selected(css, ".auth-label"), ...selected(css, ".auth-input")];
    const dead = watched
      .map((r) => ({ selector: r.selector, expr: colorDecl(r.body) }))
      .filter((r): r is { selector: string; expr: string } => !!r.expr)
      .filter((r) => !tokensOf(r.expr).some((t) => declared.has(t)));
    expect(
      `${theme}: красок мимо ролей схемы = ${dead.length}` +
        (dead.length ? ` (${dead.map((d) => `${d.selector}: ${d.expr}`).join(" | ")})` : ""),
    ).toBe(`${theme}: красок мимо ролей схемы = 0`);
    expect(watched.filter((r) => colorDecl(r.body)).length).toBeGreaterThan(5);
  });

  it.each(THEMES)("%s: заголовок и текст не перепутаны местами", (theme) => {
    // Проверка узкая намеренно: она смотрит ТОЛЬКО правила, которые красятся
    // ролями `--color-text`/`--color-heading`. Приглушённый текст на
    // `--color-muted` и текст кнопки на `--color-button-text` — законные роли
    // тех же шрифтов, и требовать от них `--color-text` значило бы ломать
    // чужую краску (ровно так эта проверка и покраснела с первого прогона:
    // 11 правил у vanilla).
    const css = globalCss(theme);
    const watched = [...accountRules(css), ...selected(css, ".auth-label"), ...selected(css, ".auth-input")];
    const wrong: string[] = [];
    let checked = 0;
    for (const r of watched) {
      const expr = colorDecl(r.body);
      if (!expr) continue;
      const tokens = tokensOf(expr);
      const readsText = tokens.includes("--color-text");
      const readsHeading = tokens.includes("--color-heading");
      if (!readsText && !readsHeading) continue;
      const heading = /font-family\s*:\s*var\(--font-heading/.test(r.body);
      const body = /font-family\s*:\s*var\(--font-body/.test(r.body);
      if (!heading && !body) continue;
      checked++;
      if (heading && !readsHeading) wrong.push(`${r.selector}: font-heading, а роль ${expr}`);
      if (body && !readsText) wrong.push(`${r.selector}: font-body, а роль ${expr}`);
    }
    expect(`${theme}: роль перепутана в ${wrong.length} правилах` + (wrong.length ? ` (${wrong.join(" | ")})` : "")).toBe(
      `${theme}: роль перепутана в 0 правилах`,
    );
    expect(checked).toBeGreaterThan(3);
  });

  it.each(THEMES)("%s: .auth-label читает роль схемы напрямую, а не через мёртвый токен", (theme) => {
    const rs = selected(globalCss(theme), ".auth-label").filter((r) => colorDecl(r.body));
    expect(rs.length).toBeGreaterThan(0);
    const bad = rs.filter((r) => (colorDecl(r.body) as string).includes(DEAD));
    // Цепочка фолбэков здесь была бы пустышкой: инлайн `.auth-shell` объявляет
    // `--color-foreground` и победил бы в каскаде на единственной странице, где
    // это правило вообще рисуется.
    expect(`${theme}: правил .auth-label через ${DEAD} = ${bad.length}`).toBe(
      `${theme}: правил .auth-label через ${DEAD} = 0`,
    );
    expect(rs.every((r) => (colorDecl(r.body) as string).includes("var(--color-text"))).toBe(true);
  });

  it.each(THEMES)("%s: .auth-input даёт фолбэк на схему (страница входа не меняется)", (theme) => {
    const rs = selected(globalCss(theme), ".auth-input").filter((r) => colorDecl(r.body));
    expect(rs.length).toBeGreaterThan(0);
    const withDead = rs.filter((r) => (colorDecl(r.body) as string).includes(DEAD));
    // Правило общее со страницей входа: локальное значение `.auth-shell` обязано
    // остаться победителем, поэтому голова цепочки — прежний токен, а запасной
    // путь — роль схемы. Без фолбэка краска в аккаунте обнуляется.
    const withoutFallback = withDead.filter((r) => !(colorDecl(r.body) as string).includes("var(--color-text"));
    expect(`${theme}: правил .auth-input с ${DEAD} без фолбэка на --color-text = ${withoutFallback.length}`).toBe(
      `${theme}: правил .auth-input с ${DEAD} без фолбэка на --color-text = 0`,
    );
    expect(withDead.length).toBeGreaterThan(0);
  });

  it.each(THEMES)("%s: страница заказа не красит текст мёртвым токеном", (theme) => {
    const file = themeFile(theme, "pages/account/order.astro");
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, "utf-8");
    const dead = src.split(DEAD).length - 1;
    expect(`${theme}: вхождений ${DEAD} в order.astro = ${dead}`).toBe(
      `${theme}: вхождений ${DEAD} в order.astro = 0`,
    );
    expect(src).toContain("var(--color-text");
  });
});
