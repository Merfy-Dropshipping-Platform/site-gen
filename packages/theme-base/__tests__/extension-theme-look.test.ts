/**
 * Спека 120, этап 5 на vanilla: режим «как тема» у формы покупки и записей в
 * «Моих заказах». Атрибут data-look="theme" на самой .xp/.xo или их предке
 * перекрашивает палитру прототипа PM в токены темы и цветовой схемы секции.
 *
 * «БЕЗ АТРИБУТА — КАК СЕЙЧАС». Базовые правила переписаны на переменные
 * (--xp-radius-*, --xp-btn-* и т.д.), поэтому прежняя строка проверяется не
 * пословно, а вычислением: из строки вырезаются все блоки с data-look,
 * а переменные xp и xo подставляются их значениями по умолчанию — так
 * получается «вид без атрибута». Снимок этого вида снят до переписывания на
 * переменные и не должен меняться (смотрим байт в байт).
 */

/** CSS без блоков data-look и с подставленными значениями переменных по умолчанию. */
export function bareCss(css: string, prefix: "--xp" | "--xo"): string {
  // 1. Разобрать на плоские блоки «селектор { тело }» и выкинуть те, чей
  //    селектор содержит data-look (правила без @media, вложенности нет).
  const kept: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].includes("data-look")) continue;
    kept.push(`${match[1].trim()} { ${match[2].trim()} }`);
  }
  const withoutTheme = kept.join(" ");
  // 2. Собрать объявления переменных: --<prefix>-name: value;
  const defaults = new Map<string, string>();
  for (const match of withoutTheme.matchAll(
    new RegExp(`(${prefix}-[a-z0-9-]+)\\s*:\\s*([^;{}]+);`, "g"),
  )) {
    defaults.set(match[1], match[2].trim());
  }
  // 3. Итеративно подставить значения (переменные могут ссылаться на переменные).
  let text = withoutTheme;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = text.replace(
      new RegExp(`var\\(\\s*(${prefix}-[a-z0-9-]+)\\s*\\)`, "g"),
      (whole, name: string) => defaults.get(name) ?? whole,
    );
    if (next === text) break;
    text = next;
  }
  // 4. Выбросить сами объявления переменных по умолчанию: снимок сравнивает
  //    правила (селектор + декларации вида), а не способ записи значений.
  const withoutDeclarations = text.replace(
    new RegExp(`${prefix}-[a-z0-9-]+\\s*:\\s*[^;{}]+;\\s*`, "g"),
    "",
  );
  return withoutDeclarations.replace(/\s+/g, " ").trim();
}

import { EXTENSION_PURCHASE_STYLES } from "../runtime/extension-purchase.styles";
import { EXTENSION_ORDERS_STYLES } from "../runtime/extension-orders.styles";

describe("стили формы покупки: без data-look — прежний вид байт в байт", () => {
  it("вычисленные правила без атрибута не меняются", () => {
    expect(bareCss(EXTENSION_PURCHASE_STYLES, "--xp")).toMatchSnapshot();
  });
});

describe("стили формы покупки: режим «как тема»", () => {
  const theme = EXTENSION_PURCHASE_STYLES.slice(
    EXTENSION_PURCHASE_STYLES.indexOf("data-look"),
  );

  it("включается атрибутом на самой .xp и на предке", () => {
    expect(EXTENSION_PURCHASE_STYLES).toContain('.xp[data-look="theme"]');
    expect(EXTENSION_PURCHASE_STYLES).toContain('[data-look="theme"] .xp');
  });

  it("цвета и поверхности — из токенов схемы", () => {
    expect(theme).toContain("--xp-ink: rgb(var(--color-text))");
    expect(theme).toContain("--xp-label: rgb(var(--color-text))");
    expect(theme).toContain("--xp-mark: rgb(var(--color-muted))");
    expect(theme).toContain("--xp-muted: rgb(var(--color-muted))");
    expect(theme).toContain("--xp-frame: rgb(var(--color-text) / .2)");
    expect(theme).toContain("--xp-line: rgb(var(--color-text) / .2)");
    expect(theme).toContain("--xp-upload-line: rgb(var(--color-text) / .2)");
    expect(theme).toContain("--xp-surface: rgb(var(--color-bg))");
    expect(theme).toContain("--xp-icon-bg: rgb(var(--color-surface))");
    expect(theme).toContain("--xp-file-bg: rgb(var(--color-surface))");
  });

  it("главная и вторая кнопки — из кнопочных токенов, включая наведение", () => {
    expect(theme).toContain("--xp-btn-bg: rgb(var(--color-button-bg))");
    expect(theme).toContain("--xp-btn-text: rgb(var(--color-button-text))");
    expect(theme).toContain("--xp-btn-border: rgb(var(--color-button-border))");
    expect(theme).toContain(
      "--xp-btn-bg-hover: rgb(var(--color-button-bg-hover))",
    );
    expect(theme).toContain(
      "--xp-btn-text-hover: rgb(var(--color-button-text-hover))",
    );
    expect(theme).toContain("--xp-btn2-bg: rgb(var(--color-button-2-bg))");
    expect(theme).toContain("--xp-btn2-text: rgb(var(--color-button-2-text))");
    expect(theme).toContain(
      "--xp-btn2-border: rgb(var(--color-button-2-border))",
    );
    expect(theme).toContain(
      "--xp-btn2-bg-hover: rgb(var(--color-button-2-bg-hover))",
    );
    expect(theme).toContain(
      "--xp-btn2-text-hover: rgb(var(--color-button-2-text-hover))",
    );
  });

  it("скругления — из радиусных токенов", () => {
    expect(theme).toContain("--xp-radius-frame: var(--radius-card)");
    expect(theme).toContain("--xp-radius-field: var(--radius-input)");
    expect(theme).toContain("--xp-radius-button: var(--radius-button)");
    expect(theme).toContain("--xp-radius-media: var(--radius-media)");
  });

  it("шрифт и вес — из токенов темы", () => {
    expect(theme).toContain("--xp-weight: var(--weight-body)");
    expect(theme).toContain("font-family: var(--font-body);");
  });

  it("заголовки формы и экрана «отправлена» — heading-токены", () => {
    expect(theme).toContain(".sf-h b");
    expect(theme).toContain(".okbox b");
    expect(theme).toContain("rgb(var(--color-heading))");
    expect(theme).toContain("var(--font-heading)");
    expect(theme).toContain("var(--weight-heading)");
  });
});

describe("стили записей в заказах: без data-look — прежний вид байт в байт", () => {
  it("вычисленные правила без атрибута не меняются", () => {
    expect(bareCss(EXTENSION_ORDERS_STYLES, "--xo")).toMatchSnapshot();
  });
});

describe("стили записей в заказах: режим «как тема»", () => {
  const theme = EXTENSION_ORDERS_STYLES.slice(
    EXTENSION_ORDERS_STYLES.indexOf("data-look"),
  );

  it("включается атрибутом на самой .xo/.xo-row и на предке", () => {
    expect(EXTENSION_ORDERS_STYLES).toContain('[data-look="theme"] .xo');
    expect(EXTENSION_ORDERS_STYLES).toContain('[data-look="theme"] .xo-row');
  });

  it("цвета — из токенов схемы", () => {
    expect(theme).toContain("--xo-ink: rgb(var(--color-text))");
    expect(theme).toContain("--xo-back: rgb(var(--color-muted))");
    expect(theme).toContain("--xo-muted: rgb(var(--color-muted))");
    expect(theme).toContain("--xo-faint: rgb(var(--color-muted))");
    expect(theme).toContain("--xo-line: rgb(var(--color-text) / .2)");
    expect(theme).toContain("--xo-surface: rgb(var(--color-bg))");
  });

  it("кнопка и скругления — из кнопочных и радиусных токенов", () => {
    expect(theme).toContain("--xo-btn-bg: rgb(var(--color-button-bg))");
    expect(theme).toContain("--xo-btn-text: rgb(var(--color-button-text))");
    expect(theme).toContain("--xo-btn-border: rgb(var(--color-button-border))");
    expect(theme).toContain(
      "--xo-btn-bg-hover: rgb(var(--color-button-bg-hover))",
    );
    expect(theme).toContain(
      "--xo-btn-text-hover: rgb(var(--color-button-text-hover))",
    );
    expect(theme).toContain("--xo-radius-row: var(--radius-card)");
    expect(theme).toContain("--xo-radius-button: var(--radius-button)");
  });

  it("шрифт и вес — из токенов темы", () => {
    expect(theme).toContain("--xo-weight: var(--weight-body)");
  });
});
