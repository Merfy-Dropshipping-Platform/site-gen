import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 21.09, дословно: «суть в том что нужно сохранять порядок иконок».
 *
 * Замер геометрии в браузере (5 тем × 4 положения логотипа × 2 типа меню)
 * показал: сам порядок «поиск → избранное → корзина → аккаунт» сохраняется
 * везде. Ломалось МЕСТО БУРГЕРА:
 *
 *   bloom, flux, vanilla — бургер справа, последним
 *   rose, satin          — бургер СЛЕВА, в одной группе с логотипом
 *
 * При этом панель бокового меню во ВСЕХ пяти темах закреплена справа
 * (`inset-y-0 right-0 w-[360px]`). То есть rose и satin ставили иконку слева, а
 * открывали справа — это же пункт 15 документа («Боковое меню открывается не с
 * той стороны, где стоит иконка меню»). Канон взят не голосованием большинства,
 * а по стороне панели: бургер справа последним.
 *
 * Гард смотрит ИСХОДНИК, а не разметку и не геометрию, и это осознанно:
 *  - геометрию меряет браузер, а CI движков не ставит (проверено на этой волне:
 *    браузерный гард падал в CI всеми проверками);
 *  - порядок в отрисованном HTML не годится тоже — там рядом лежат мобильная
 *    строка, панель поиска и сама шторка, у каждой свои иконки, и они попадают
 *    в выборку.
 * Поэтому пинится ровно та ФОРМА, которая была сломана: блок бургера, за
 * которым сразу идёт ссылка логотипа.
 */
const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const headerSource = (theme: string) =>
  readFileSync(
    resolve(ROOT, "themes", theme, "src", "components", "Header.astro"),
    "utf8",
  );

/** Блоки `{isSidebar && ( … )}`, внутри которых лежит кнопка бургера. */
function sidebarBurgerBlocks(
  src: string,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf("{isSidebar && (", from);
    if (i < 0) break;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const end = j + 1;
    if (src.slice(i, end).includes("data-burger-toggle"))
      out.push({ start: i, end });
    from = end;
  }
  return out;
}

/**
 * Открывающий тег шторки целиком — от `<` до закрывающей `>`.
 *
 * Было окно в 900 символов от `id="<тема>-burger"`. Оно покраснело на правке,
 * которая ДОБАВИЛА в тот же class:list пояснение и класс схемы меню: `right-0`
 * просто уехал за край окна, хотя сторона панели не менялась. Считаем границу
 * тега, а не символы: скобки `{…}` пропускаем, чтобы `>` внутри выражения не
 * оборвал тег раньше времени.
 */
function drawerDecl(src: string, theme: string): string | null {
  const at = src.indexOf(`id="${theme}-burger"`);
  if (at < 0) return null;
  const start = src.lastIndexOf("<", at);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

const ACTION_LABEL = /aria-label="(Поиск|Избранное|Корзина|Аккаунт|Профиль)"/;

describe("бургер стоит в группе иконок, а не рядом с логотипом", () => {
  it.each(THEMES)(
    "%s: у темы есть десктопный бургер под «Боковое»",
    (theme) => {
      expect(sidebarBurgerBlocks(headerSource(theme)).length).toBeGreaterThan(
        0,
      );
    },
  );

  it.each(THEMES)("%s: сразу за бургером не идёт логотип", (theme) => {
    const src = headerSource(theme);
    for (const { end } of sidebarBurgerBlocks(src)) {
      // Окно — только до конца СВОЕЙ группы. Без этого проверка перешагивала в
      // следующую ветку раскладки и ловила её логотип как «сразу за бургером»
      // (поймано на bloom, где бургер стоит последним и это верно).
      const tail = src.slice(end, end + 600);
      const groupEnd = tail.indexOf("</div>");
      const after = groupEnd >= 0 ? tail.slice(0, groupEnd) : tail;
      const logoAt = after.search(/<a\s[^>]*href="\/"/);
      const actionAt = after.search(ACTION_LABEL);
      // Сломанная форма: логотип встречается раньше любой иконки действия —
      // значит бургер лежит в левой группе вместе с ним.
      const broken = logoAt >= 0 && (actionAt < 0 || logoAt < actionAt);
      expect({ theme, бургерПередЛоготипом: broken }).toEqual({
        theme,
        бургерПередЛоготипом: false,
      });
    }
  });

  it.each(THEMES)("%s: панель бокового меню закреплена справа", (theme) => {
    const src = headerSource(theme);
    const decl = drawerDecl(src, theme);
    expect({ theme, панельНайдена: decl !== null }).toEqual({
      theme,
      панельНайдена: true,
    });
    // Канон стороны: бургер справа ⇒ панель справа. Ищем в объявлении панели.
    expect(decl).toContain("right-0");
  });
});
