import { execFileSync } from "node:child_process";
import { parse, type HTMLElement } from "node-html-parser";

/**
 * Пункт 26 документа владельца «баги шапки и меню»: «Расширенное меню не
 * растягивается на всю длину шапки… плюс сами пункты верхнего уровня наезжают
 * друг на друга».
 *
 * ЗАМЕР (Chromium, 5 тем × 5 положений логотипа × 1280/1440/1920, наведение на
 * пункт с подменю). В документе баг записан на flux — у flux как раз чисто во
 * всех клетках. Нашлось в других темах:
 *
 *   bloom  «Слева»/«Справа»/«По центру»  лист 1280 из 1440 (левый край 80),
 *                                        на 1920 — 1320 из 1920;
 *   rose   «По центру»                   лист 1280 из 1440 и накрыты ВСЕ
 *                                        пункты верхнего уровня;
 *   satin  «Слева», 1280                 пункт «TWS-наушники с кейсом»
 *                                        переносился внутри себя на три строки,
 *                                        вырастал до 76px при строке шапки 64px,
 *                                        вылезал под неё — и там его накрывала
 *                                        плашка.
 *
 * ПРИЧИНА одна на bloom/rose/satin: плашка объявлена `absolute left-0 right-0
 * top-full`, то есть считает края от БЛИЖАЙШЕГО ПОЗИЦИОНИРОВАННОГО предка. Им
 * оказывалась строка шапки — она уже шапки (свои поля, `max-w`) и ниже её низа
 * не доходит. Позиционированной строку делал абсолютно центрированный логотип.
 *
 * ПРАВКА: логотип «по центру» центрируется гридом `[1fr auto 1fr]`, как это уже
 * сделано у flux, а `relative` со строки снят — якорем плашки снова становится
 * сам `<header>`. Плюс у satin пункт не переносится внутри себя
 * (`whitespace-nowrap`), не помещающиеся пункты переносятся целиком, а строка
 * шапки растёт вместе с ними (`min-h`).
 *
 * Замер после правки: все пять тем, все положения, все ширины — плашка ровно во
 * всю ширину шапки, видимых пунктов не накрывает. Отклонение центра логотипа от
 * центра шапки в положении «по центру» — 0px (проверено и на «Выпадающем», и на
 * «Расширенном», и на «Боковом»).
 *
 * Гоча замера: у обёртки плашки сверху прозрачный зазор `pt-4`, и по внешней
 * рамке «наложение» в 4px показывалось там, где видимая плашка ничего не
 * накрывает. Мерить надо ВНУТРЕННИЙ блок с фоном.
 *
 * Гард смотрит разметку: геометрию меряет браузер, а CI движков не ставит.
 * Пиним то, что ломалось, — цепочку предков плашки без позиционирования.
 */
const RENDERER = require.resolve("./render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;
/** Положения логотипа, которые рисуют ОДНОрядную раскладку. */
const POSITIONS = ["center-left", "center-right", "center-absolute"] as const;

const NAV = [
  { label: "Главная", href: "/" },
  {
    label: "Полноразмерные наушники",
    href: "/c/over",
    submenu: [
      {
        label: "Беспроводные",
        href: "/c/bt",
        submenu: [{ label: "Sony", href: "/c/sony" }],
      },
    ],
  },
  { label: "TWS-наушники с кейсом", href: "/c/tws" },
];

const POSITIONED = /(^|\s)(relative|absolute|fixed|sticky)($|\s)/;

function render(theme: string, logoPosition: string): HTMLElement {
  const props = {
    id: "Header-1",
    menuType: "mega-menu",
    logoPosition,
    navigationLinks: NAV,
    links: NAV,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return parse(res.html ?? "");
}

/** Плашка «Расширенного» меню — блок, который показывается по group-hover/mega. */
function megaSheet(root: HTMLElement): HTMLElement | null {
  return (
    root
      .querySelectorAll("div")
      .find((el) => (el.getAttribute("class") ?? "").includes("group-hover/mega:visible")) ?? null
  );
}

/** Предки плашки до `<header>` включительно. */
function ancestorsUpToHeader(sheet: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let node = sheet.parentNode as HTMLElement | null;
  while (node && node.tagName) {
    chain.push(node);
    if (node.tagName.toLowerCase() === "header") break;
    node = node.parentNode as HTMLElement | null;
  }
  return chain;
}

describe("плашка «Расширенного» меню во всю ширину шапки", () => {
  const cases = THEMES.flatMap((theme) =>
    POSITIONS.map((pos) => [theme, pos] as const),
  );

  it.each(cases)("%s / %s: плашка есть и растянута от края до края", (theme, pos) => {
    const sheet = megaSheet(render(theme, pos));
    expect({ theme, pos, плашкаНайдена: sheet !== null }).toEqual({
      theme,
      pos,
      плашкаНайдена: true,
    });
    const cls = sheet!.getAttribute("class") ?? "";
    expect({ theme, pos, отКраяДоКрая: /left-0/.test(cls) && /right-0/.test(cls) }).toEqual({
      theme,
      pos,
      отКраяДоКрая: true,
    });
  });

  it.each(cases)("%s / %s: якорь плашки — сама шапка", (theme, pos) => {
    const sheet = megaSheet(render(theme, pos));
    const chain = ancestorsUpToHeader(sheet!);
    const header = chain[chain.length - 1];
    expect({ theme, pos, дошлиДоШапки: header?.tagName?.toLowerCase() }).toEqual({
      theme,
      pos,
      дошлиДоШапки: "header",
    });
    // Позиционированный предок МЕЖДУ плашкой и шапкой перехватывает края:
    // именно так плашка и получалась уже шапки.
    const between = chain.slice(0, -1).filter((el) => {
      const cls = el.getAttribute("class") ?? "";
      // Сам пункт-обёртка (`group/mega`) позиционированным быть не должен тоже.
      return POSITIONED.test(cls);
    });
    expect({
      theme,
      pos,
      позиционированныеПредки: between.map((el) =>
        (el.getAttribute("class") ?? "").slice(0, 40),
      ),
    }).toEqual({ theme, pos, позиционированныеПредки: [] });
  });

  it("satin: длинный пункт не переносится внутри себя", () => {
    // Он вырастал в три строки и вылезал из строки шапки — там плашка его и
    // накрывала. Ряд пунктов теперь переносится целиком, а шапка растёт.
    const root = render("satin", "center-left");
    const links = root
      .querySelectorAll("a")
      .filter((a) => (a.getAttribute("class") ?? "").includes("group/mega"));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("class")).toContain("whitespace-nowrap");
    }
    const nav = root.querySelector("nav[data-nav-inline]");
    expect(nav?.getAttribute("class")).toContain("flex-wrap");
  });
});
