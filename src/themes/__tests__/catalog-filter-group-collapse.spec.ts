/**
 * @jest-environment jsdom
 *
 * Сворачивание списка группы фильтров в боковой панели и в шторке телефона —
 * во всех пяти темах (владелец: «возможность скрывать и раскрывать список
 * фильтров, все темы»). Макет-скрин: группы «Цвет» (7 вариантов), «Оттенок»
 * (3), «Размер» (L/M/S…) в боковой панели/шторке рисовались развёрнутыми
 * целиком, длинной простынёй. Нужно: заголовок группы («Наличие»,
 * «Стоимость», «Цвет», «Сортировать», «Коллекции») — кликабельная кнопка с
 * шевроном, по нажатию список группы сворачивается/разворачивается.
 *
 * Разметка: заголовок — `<button data-nt="filter-group-toggle"
 * aria-expanded>`, список — соседний элемент `[data-filter-group-body]`.
 * Обработчик — один делегированный `<script is:inline>` в Catalog.astro
 * каждой темы (window.__merfyFilterGroups, текст один на пять тем — сторож
 * ниже), переживает и клоны групп параметров товара (Оттенок/Размер из
 * /api/store/filters), и перерисовку блока в конструкторе.
 *
 * Старт — всегда развёрнуто, состояние между заходами не хранится (решение
 * по умолчанию: ничего не прячем без запроса владельца).
 *
 * Ревью (Opus) 28.09 на первую версию гарда:
 *   • «Белый» проверялся по textContent всей секции, а это слово есть и в
 *     demo-разметке (NtFilterSidebar/NtFilterPanel рисуют статичные
 *     чёрный/белый/серый ДО живых данных) — проверка ничего не доказывала.
 *     Правим на `[data-color-option="Белый"]`: этот атрибут ставит ТОЛЬКО
 *     bindColors()/renderChoice() по живым данным, в demo-разметке его нет.
 *   • Не было проверки главного случая со скрина владельца — клона группы
 *     параметров товара («Оттенок» из «Цвета»): cloneNode копирует ТЕКУЩЕЕ
 *     состояние сворачивания «Цвета», и если покупатель свернул «Цвет» до
 *     повторной гидрации (client-side навигация — `astro:page-load` на новом
 *     URL, без полной перезагрузки страницы), клон рисовался свёрнутым.
 *   • Не было проверки, что правило `[data-filter-group-body][hidden]
 *     {display:none}` реально ЕСТЬ в бандле и ПОБЕЖДАЕТ `.flex`, а не просто
 *     «строка есть в файле» (полагаться в CI жать на подстроку — привычная
 *     дыра CSS-каскада этого проекта, catalog-filters-mobile.spec.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  показать,
  нажать,
  поставитьСтенд,
  снять,
  дождаться,
  ТЕМЫ,
} from "./lib/catalog-dom";
import { parseRules, winnerIn, type Rule } from "./lib/css-cascade";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

jest.setTimeout(60_000);

beforeAll(() => поставитьСтенд());
afterAll(() => снять());

describe.each(ТЕМЫ)("сворачивание группы фильтров — %s", (тема) => {
  it("группы стартуют развёрнутыми: кнопка-заголовок, шеврон, видимый список", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
    });
    const кнопки = [
      ...корень.querySelectorAll('[data-nt="filter-group-toggle"]'),
    ];
    expect(кнопки.length).toBeGreaterThan(0);
    for (const кнопка of кнопки) {
      const тело = кнопка.nextElementSibling as HTMLElement | null;
      expect({
        тег: кнопка.tagName,
        развёрнута: кнопка.getAttribute("aria-expanded"),
        естьТело: !!тело,
        скрытоТело: тело?.hidden ?? "нет тела",
        естьШеврон: !!кнопка.querySelector('[data-nt="filter-group-chevron"]'),
      }).toEqual({
        тег: "BUTTON",
        развёрнута: "true",
        естьТело: true,
        скрытоТело: false,
        естьШеврон: true,
      });
    }
  });

  it("клик по заголовку сворачивает список, повторный клик — разворачивает", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
    });
    const кнопка = корень.querySelector(
      '[data-nt="filter-group-toggle"]',
    ) as HTMLElement;
    const тело = кнопка.nextElementSibling as HTMLElement;
    нажать(кнопка);
    const свернули = {
      развёрнута: кнопка.getAttribute("aria-expanded"),
      скрыто: тело.hidden,
    };
    нажать(кнопка);
    const развернули = {
      развёрнута: кнопка.getAttribute("aria-expanded"),
      скрыто: тело.hidden,
    };
    expect({ свернули, развернули }).toEqual({
      свернули: { развёрнута: "false", скрыто: true },
      развернули: { развёрнута: "true", скрыто: false },
    });
  });

  it("сворачивание одной группы не трогает соседние", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
    });
    const кнопки = [
      ...корень.querySelectorAll('[data-nt="filter-group-toggle"]'),
    ];
    expect(кнопки.length).toBeGreaterThan(1);
    const первая = кнопки[0];
    const остальные = кнопки.slice(1);
    нажать(первая);
    expect({
      первая: первая.getAttribute("aria-expanded"),
      остальные: остальные.map((b) => b.getAttribute("aria-expanded")),
    }).toEqual({
      первая: "false",
      остальные: остальные.map(() => "true"),
    });
  });

  it("«Цвет» после конверсии заголовка в кнопку по-прежнему находится и рисует живые значения (bindColors/renderChoice не сломаны)", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
    });
    // data-color-option ставит ТОЛЬКО живой рендер цвета (bindColors/
    // renderChoice, по данным /api/store/filters) — в demo-разметке
    // (NtFilterSidebar/NtFilterPanel/VanillaCatalogFilterSidebar) этого
    // атрибута нет, поэтому в отличие от простого textContent.includes("Белый")
    // проверка не зеленеет на статичной заглушке.
    const живойЦвет = корень.querySelector('[data-color-option="Белый"]');
    expect(живойЦвет).not.toBeNull();
  });

  it("aria-controls статичных групп указывает на настоящее тело группы", async () => {
    const корень = await показать(тема);
    const кнопки = [
      ...корень.querySelectorAll('[data-nt="filter-group-toggle"][aria-controls]'),
    ];
    expect(кнопки.length).toBeGreaterThan(0);
    for (const кнопка of кнопки) {
      const id = кнопка.getAttribute("aria-controls")!;
      const поId = document.getElementById(id);
      expect({ id, this: поId === кнопка.nextElementSibling }).toEqual({
        id,
        this: true,
      });
    }
  });

  it("клон группы параметров товара («Оттенок» из «Цвета») стартует развёрнутым, даже если «Цвет» был свёрнут до повторной гидрации", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
      доп_параметры: [
        { name: "Оттенок", values: ["Тёплый", "Холодный", "Нейтральный"] },
      ],
    });
    // Один экземпляр сайдбара (сайдбар «Сбоку» и шторка — оба содержат свою
    // пару «Цвет»/«Оттенок»; берём первый, чтобы не путать два клона).
    const панель = корень.querySelector('[data-nt="filter-sidebar"]')!;
    const найтиКнопку = (текст: string) =>
      [...панель.querySelectorAll('[data-nt="filter-group-toggle"]')].find(
        (b) => (b.textContent ?? "").trim() === текст,
      ) as HTMLElement | undefined;

    // Клон уже есть сразу после первого рендера — свежий, развёрнутый.
    expect(найтиКнопку("Оттенок")?.getAttribute("aria-expanded")).toBe("true");

    // Покупатель сворачивает «Цвет» — ДО повторной гидрации.
    нажать(найтиКнопку("Цвет"));
    expect(найтиКнопку("Цвет")?.getAttribute("aria-expanded")).toBe("false");

    // Повторная гидрация без перезагрузки страницы (client-side навигация —
    // astro:page-load на новом URL, ровно как ловит hydrateCatalog() каждой
    // темы): bindVariants() убирает старый клон «Оттенок» и создаёт новый ИЗ
    // ТЕКУЩЕГО (свёрнутого) шаблона «Цвет» — клон обязан начинать развёрнутым.
    window.history.replaceState({}, "", "/?повтор-гидрации=1");
    document.dispatchEvent(new Event("astro:page-load"));
    await дождаться();

    const оттенокПосле = найтиКнопку("Оттенок")!;
    const телоОттенка = оттенокПосле.nextElementSibling as HTMLElement;
    const цветПосле = найтиКнопку("Цвет")!;
    expect({
      оттенокРазвёрнут: оттенокПосле.getAttribute("aria-expanded"),
      оттенокТелоСкрыто: телоОттенка.hidden,
      // «Цвет» — СВОЙ собственный выбор покупателя, фикс его не трогает.
      цветОстаётсяСвёрнут: цветПосле.getAttribute("aria-expanded"),
    }).toEqual({
      оттенокРазвёрнут: "true",
      оттенокТелоСкрыто: false,
      цветОстаётсяСвёрнут: "false",
    });
  });
});

/**
 * Обработчик сворачивания групп — один текст на пять тем (как у шторки
 * «Фильтры и сортировка» и у чипов фильтров, no-second-implementation.spec.ts):
 * починили в одной теме — починили во всех.
 */
describe("обработчик сворачивания группы фильтров в портах не расходится", () => {
  const ПОРТЫ = ["rose", "flux", "satin", "bloom", "vanilla"].map(
    (t) => `packages/theme-${t}/blocks/Catalog/Catalog.astro`,
  );

  const тело = (rel: string): string => {
    const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
    const i = src.indexOf("window.__merfyFilterGroups");
    expect({ порт: rel, найдено: i > -1 }).toEqual({ порт: rel, найдено: true });
    const j = src.indexOf("</script>", i);
    return src.slice(i, j).replace(/\s+/g, " ").trim();
  };

  it("у всех пяти портов один и тот же текст", () => {
    const эталон = тело(ПОРТЫ[0]);
    for (const порт of ПОРТЫ.slice(1)) {
      expect({ порт, совпадает: тело(порт) === эталон }).toEqual({
        порт,
        совпадает: true,
      });
    }
  });
});

/**
 * Видимость свёрнутого тела группы — НЕ «строка есть в файле», а победитель
 * каскада в РЕАЛЬНОМ бандле темы (dist/theme-css/<тема>.css, тот же движок,
 * что у catalog-filters-mobile.spec.ts): jsdom не считает layout/specificity
 * сам, а наивный includes() зеленеет и тогда, когда Tailwind-утилита `.flex`
 * (та же специфичность (0,1,0), тот же @layer utilities) правило перебивает.
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections:all (как и
 * у остальных гардов каскада в этом каталоге).
 */
describe.each(ТЕМЫ)(
  "[data-filter-group-body][hidden]{display:none} реально побеждает .flex — %s",
  (тема) => {
    const bundlePath = resolve(
      SITES_ROOT,
      "dist",
      "theme-css",
      `${тема}.css`,
    );
    let bundle: string;
    let rules: Rule[];

    beforeAll(() => {
      if (!existsSync(bundlePath)) {
        throw new Error(
          `нет ${bundlePath} — сначала pnpm build:blocks && pnpm build:theme-sections:all`,
        );
      }
      bundle = readFileSync(bundlePath, "utf-8");
      rules = parseRules(bundle);
    });

    it("правило [data-filter-group-body][hidden] есть в общем catalog-filters.css бандла", () => {
      expect(bundle).toEqual(
        expect.stringContaining("[data-filter-group-body][hidden]"),
      );
    });

    it("скрытое тело группы (класс flex + hidden) рисуется display:none, а не flex", async () => {
      const корень = await показать(тема, {}, true, {
        цвета: ["Белый", "Чёрный", "Серый"],
      });
      // Тело с классом flex — «Наличие»/«Сортировать»/«Цвет» (у «Стоимости»
      // своего flex нет — там просто обёртка над NtFilterPriceRows).
      const тело = корень.querySelector(
        '[data-nt="filter-sidebar"] .flex[data-filter-group-body]',
      ) as HTMLElement;
      expect(тело).not.toBeNull();
      тело.hidden = true;
      const победитель = winnerIn(bundle, rules, тело, "display", 1280);
      expect(победитель?.decls.display?.replace(/\s+/g, "")).toBe("none");
    });

    it("видимое (не hidden) тело группы остаётся display:flex — правило не прячет лишнего", async () => {
      const корень = await показать(тема, {}, true, {
        цвета: ["Белый", "Чёрный", "Серый"],
      });
      const тело = корень.querySelector(
        '[data-nt="filter-sidebar"] .flex[data-filter-group-body]',
      ) as HTMLElement;
      expect(тело).not.toBeNull();
      тело.hidden = false;
      const победитель = winnerIn(bundle, rules, тело, "display", 1280);
      expect(победитель?.decls.display?.replace(/\s+/g, "")).toBe("flex");
    });
  },
);
