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
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  показать,
  нажать,
  поставитьСтенд,
  снять,
  ТЕМЫ,
} from "./lib/catalog-dom";

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

  it("«Цвет» после конверсии заголовка в кнопку по-прежнему находится и рисует значения (bindColors/cloneColorBox не сломаны)", async () => {
    const корень = await показать(тема, {}, true, {
      цвета: ["Белый", "Чёрный", "Серый"],
    });
    const текст = (корень.textContent ?? "").replace(/\s+/g, " ");
    expect(текст).toEqual(expect.stringContaining("Белый"));
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
