import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец, 25.09 — отмена правила 21.09/23.09.
 *
 * Тестеру задан вопрос дословно: «Бургер бокового меню на компьютере. Сейчас
 * он слева на телефоне и справа на компьютере (ваше правило 21.09). Тестер
 * просит слева везде. Переносить?» Ответ владельца: «да».
 *
 * Это ОТМЕНЯЕТ канон коммитов `59bb1a50` (21.09, дословно владельца тогда:
 * «суть в том что нужно сохранять порядок иконок» — бургер справа, последним,
 * по стороне панели) и `752cd8ac` (23.09, стороны выезда шторки закреплены в
 * коде явно под тот канон). Новое решение: бургер СЛЕВА на любой ширине — как
 * было всегда на телефоне, теперь и на десктопе, во всех пяти темах. Шторка
 * выезжает с той же стороны, что и иконка: слева. Порядок и состав иконок
 * действий справа (поиск → избранное → корзина → аккаунт) НЕ меняется — их
 * порядок остаётся ровно как задал коммит `59bb1a50`, просто без бургера в
 * этой группе.
 *
 * Гард смотрит ИСХОДНИК, а не разметку и не геометрию — та же причина, что и
 * раньше (браузерный гард падал в CI, а в отрисованном HTML рядом лежат
 * мобильная строка/панель поиска/шторка со своими иконками). Пинится форма:
 * блок бургера НЕ идёт сразу за иконкой действия (поиск/избранное/корзина/
 * аккаунт) — то есть он не в правой группе действий; и панель бокового меню
 * закреплена слева (`lg:right-auto`, без `lg:left-auto`).
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

/**
 * Позиции открытий `<div …>` вплоть до `upto`, минус те, что успели
 * закрыться до этой точки — то есть стек РЕАЛЬНО открытых на этот момент
 * div-ов. Последний элемент — непосредственный родитель позиции `upto`.
 * Считаем только `div`: `<a>`/`<button>`/`<span>` вокруг иконок сами
 * сбалансированы и глубину группировки не меняют.
 */
function openDivsBefore(src: string, upto: number): number[] {
  const stack: number[] = [];
  const re = /<div\b|<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index >= upto) break;
    if (m[0] === "</div>") stack.pop();
    else stack.push(m.index);
  }
  return stack;
}

/**
 * Содержимое `<div …> … </div>`, начиная с открывающей позиции `divOpenAt`,
 * плюс абсолютное смещение начала этого содержимого (для перевода абсолютных
 * позиций других находок в координаты внутри `content`).
 */
function divGroupContent(
  src: string,
  divOpenAt: number,
): { content: string; contentStart: number } {
  const contentStart = src.indexOf(">", divOpenAt) + 1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = contentStart;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[0] === "</div>") {
      depth -= 1;
      if (depth === 0) return { content: src.slice(contentStart, m.index), contentStart };
    } else {
      depth += 1;
    }
  }
  return { content: src.slice(contentStart), contentStart };
}

describe("бургер стоит слева, не в правой группе действий", () => {
  it.each(THEMES)(
    "%s: у темы есть десктопный бургер под «Боковое»",
    (theme) => {
      expect(sidebarBurgerBlocks(headerSource(theme)).length).toBeGreaterThan(
        0,
      );
    },
  );

  it.each(THEMES)(
    "%s: перед бургером в его группе не идёт иконка действия (не правая группа)",
    (theme) => {
      const src = headerSource(theme);
      for (const { start } of sidebarBurgerBlocks(src)) {
        // Родитель бургера — реально открытый на этой позиции <div> (глубина
        // вложенности, а не окно символов: у satin длинный class счётчика
        // корзины однажды почти вытолкнул фиксированное окно за иконку).
        const opens = openDivsBefore(src, start);
        const parentAt = opens.at(-1);
        expect({ theme, естьРодитель: parentAt !== undefined }).toEqual({
          theme,
          естьРодитель: true,
        });
        const { content: group, contentStart } = divGroupContent(src, parentAt!);
        // У раскладки single-row родитель бургера — весь рельс строки (лого +
        // nav + группа действий вложена ДАЛЬШЕ как сестра, не как отдельная
        // мини-обёртка) — action-иконка встречается в группе ВСЕГДА, вопрос
        // только в ПОРЯДКЕ: раньше бургера — сломанная форма (бургер в конце
        // правой группы), позже — новая (бургер первым, действия дальше).
        const actionAtInGroup = group.search(ACTION_LABEL);
        const burgerAtInGroup = start - contentStart;
        const actionBeforeBurger =
          actionAtInGroup >= 0 && actionAtInGroup < burgerAtInGroup;
        expect({ theme, действиеПередБургеромВГруппе: actionBeforeBurger }).toEqual({
          theme,
          действиеПередБургеромВГруппе: false,
        });
      }
    },
  );

  it.each(THEMES)("%s: панель бокового меню закреплена слева", (theme) => {
    const src = headerSource(theme);
    const decl = drawerDecl(src, theme);
    expect({ theme, панельНайдена: decl !== null }).toEqual({
      theme,
      панельНайдена: true,
    });
    // Канон стороны (25.09): бургер слева ⇒ панель слева. `<bp>:right-auto`
    // отпускает правый край на десктопном пороге — колонка 360px садится на
    // левый (мобильный `left-0` из базовых классов остаётся действовать и на
    // пороге). Порог у тем разный (lg у rose/satin-без-парити, md у
    // bloom/flux/vanilla/satin-парити) — сторож проверяет и тот, и другой.
    // Старый `<bp>:left-auto` (правило 21.09) не должен вернуться НИ В ОДНОЙ
    // ветке (у satin их две — designParity true/false).
    expect(decl).toMatch(/\b(?:lg|md):right-auto\b/);
    expect(decl).not.toMatch(/\b(?:lg|md):left-auto\b/);
    // Не только статичная сторона: выезд/уход на пороге тоже должен быть
    // «минус» (влево), а не «плюс» (вправо, старый выезд справа) — иначе
    // панель встанет слева, но анимация будет по-прежнему уезжать направо.
    expect(decl).toMatch(/\b(?:lg|md):(?:starting:|\[&\.hidden\]:)-translate-x-full\b/);
    expect(decl).not.toMatch(/\b(?:lg|md):(?:starting:|\[&\.hidden\]:)translate-x-full\b/);
  });
});
