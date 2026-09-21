import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 21.09, по скриншоту: «не должно быть поиска слева».
 *
 * Замер геометрии (5 тем × 2 двухрядных положения × 2 типа меню): в положении
 * «Сверху в центре» поиск стоял ОДИН в левой ячейке грида `[1fr auto 1fr]`, а
 * остальные иконки — в правой. Ряд действий разрывался пополам через всю
 * ширину шапки. Так было во ВСЕХ пяти темах, включая vanilla, которую документ
 * владельца приводит как рабочий пример — значит скрины 3 и 4 показывают
 * желаемое, а не текущее поведение.
 *
 * Поиск переехал к остальным иконкам, первым в группе (порядок «поиск →
 * избранное → корзина → аккаунт» сохранён, сторож `header-burger-position`).
 * Левая ячейка осталась пустой распоркой: без неё логотип перестаёт быть по
 * центру грида — проверено, отклонение центра логотипа 0px во всех пяти темах.
 *
 * Гард смотрит ИСХОДНИК: геометрию меряет браузер, а CI движков не ставит
 * (проверено на этой волне — браузерный гард падал в CI всеми проверками).
 */
const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const headerSource = (theme: string) =>
  readFileSync(
    resolve(ROOT, "themes", theme, "src", "components", "Header.astro"),
    "utf8",
  );

const GRID = "grid-cols-[1fr_auto_1fr]";

/** Кусок разметки от начала грида до ячейки логотипа — это и есть левая ячейка. */
function leftCell(src: string): string | null {
  const g = src.indexOf(GRID);
  if (g < 0) return null;
  const logo = src.indexOf("justify-center", g);
  if (logo < 0) return null;
  return src.slice(g, logo);
}

describe("поиск не стоит отдельно слева от остальных иконок", () => {
  it.each(THEMES)(
    "%s: у темы есть грид-раскладка «Сверху в центре»",
    (theme) => {
      expect(leftCell(headerSource(theme))).not.toBeNull();
    },
  );

  it.each(THEMES)("%s: в левой ячейке грида нет кнопки поиска", (theme) => {
    const cell = leftCell(headerSource(theme));
    expect({
      theme,
      поискСлева: (cell ?? "").includes('aria-label="Поиск"'),
    }).toEqual({
      theme,
      поискСлева: false,
    });
  });

  it.each(THEMES)(
    "%s: поиск лежит в одной группе с другими иконками",
    (theme) => {
      const src = headerSource(theme);
      const g = src.indexOf(GRID);
      expect(g).toBeGreaterThan(-1);
      // правая группа грида: от `justify-end` до конца грида
      const right = src.indexOf("justify-end", g);
      expect({ theme, правойГруппыНет: right < 0 }).toEqual({
        theme,
        правойГруппыНет: false,
      });
      const tail = src.slice(right, right + 4000);
      const hasSearch = tail.includes('aria-label="Поиск"');
      const hasOther =
        /aria-label="(Корзина|Избранное|Аккаунт|Профиль)"/.test(tail) ||
        tail.includes("WishlistLink");
      expect({ theme, поискСправа: hasSearch, естьСоседи: hasOther }).toEqual({
        theme,
        поискСправа: true,
        естьСоседи: true,
      });
    },
  );
});
