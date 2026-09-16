/**
 * Поверхность контейнера наследуется из темы, когда мерчант её не задал.
 *
 * Жалоба владельца 2026-09-16 (пункт 27 его списка): «Мультиколонны Vanilla —
 * не применяется цветовая схема к Контейнеру… берет несуществующий цвет для
 * контейнера и непонятно откуда».
 *
 * Механика бага. Поля «Поверхность» в редакторе схемы НЕТ (состав настроек —
 * канон), поэтому у мерчанта, который хоть раз сохранил схему, ключа
 * `surfaceBg` в ней не существует. Генератор в таком случае не печатал
 * `--color-surface` ВООБЩЕ, а контейнер «Мультиколонн»
 * (`bg-[rgb(var(--color-surface))]`) падал на общий для всех тем запасной
 * `250 250 250` — цвет, которого нет ни в одной схеме магазина. Отсюда и
 * «непонятно откуда».
 *
 * Почему правка темы не помогала: значения в `theme.json` применяются только
 * там, где мерчантской схемы нет. Как только схема сохранена — она побеждает
 * целиком, вместе с отсутствующей поверхностью.
 *
 * Лечение — наследование из манифеста темы, тем же приёмом, что уже работал
 * для акцента (`--color-accent`).
 *
 * Замер 2026-09-17 на vanilla, схема мерчанта без `surfaceBg`:
 *   до правки  → переменной нет вовсе;
 *   после      → `--color-surface: 46 58 35` (значение темы).
 */
import { buildTokensCss } from "../tokens-css";

const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;

/** Схема мерчанта ровно в том виде, в каком её сохраняет редактор: без поверхности. */
const merchantSchemeWithoutSurface = {
  colorSchemes: [
    {
      id: "scheme-1",
      name: "1",
      background: "#26311c",
      heading: "#ffffff",
      text: "#ffffff",
    },
  ],
};

const ruleOf = (css: string, id = 1): string =>
  css.match(new RegExp(`\\.color-scheme-${id}\\s*\\{[^}]*\\}`))?.[0] ?? "";

describe("поверхность схемы наследуется из темы", () => {
  it.each(THEMES)(
    "%s: схема мерчанта без поверхности всё равно печатает --color-surface",
    (theme) => {
      const css = buildTokensCss(merchantSchemeWithoutSurface, theme);
      const rule = ruleOf(css);
      expect({ тема: theme, естьПравило: rule.length > 0 }).toEqual({
        тема: theme,
        естьПравило: true,
      });
      // Главное: переменная напечатана. Без неё контейнер берёт общий запасной
      // цвет, не принадлежащий ни одной схеме магазина.
      expect({ тема: theme, естьПоверхность: rule.includes("--color-surface") }).toEqual({
        тема: theme,
        естьПоверхность: true,
      });
    },
  );

  it("значение берётся из темы, а не из общего запасного набора", () => {
    const css = buildTokensCss(merchantSchemeWithoutSurface, "vanilla");
    const surface = ruleOf(css).match(/--color-surface:\s*([^;}]+)/)?.[1]?.trim();
    // 46 58 35 — поверхность схемы 1 в packages/theme-vanilla/theme.json.
    // 250 250 250 — общий запасной, тот самый «непонятно откуда».
    expect(surface).toBe("46 58 35");
    expect(surface).not.toBe("250 250 250");
  });

  it("свою поверхность мерчанта не перетираем", () => {
    const css = buildTokensCss(
      {
        colorSchemes: [
          {
            id: "scheme-1",
            name: "1",
            background: "#26311c",
            surfaceBg: "#ff00aa",
            heading: "#ffffff",
            text: "#ffffff",
          },
        ],
      },
      "vanilla",
    );
    expect(ruleOf(css)).toContain("--color-surface: 255 0 170");
  });
});
