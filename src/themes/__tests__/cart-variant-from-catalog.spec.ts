/**
 * @jest-environment jsdom
 *
 * Подпись варианта строки корзины — из КОМБИНАЦИИ, цвет — кружком.
 *
 * Пункт 26 тестера (22.09, повтор 23.09: «ничего не поменялось»). Строка
 * корзины выходила пустой, когда кнопка «В корзину» передавала только номер
 * комбинации без названия. Таких кнопок больше десятка (страница товара,
 * карточки каталога, «Популярное», поиск), поэтому подпись выводит ядро
 * корзины по каталогу: если комбинация найдена, её опции и есть подпись.
 *
 * Владелец, 23.09: «цвет не надо словами писать, если там круг — то круг».
 * Опция-цвет (цвет мерчанта из платформы или цвет по названию в группе
 * «Цвет»/«Оттенок») рисуется кружком, название — в подсказке.
 */
import {
  labelNtLinesFromCatalog,
  reconcileNtLines,
  variantHtml,
  variantParts,
  type NtCartLine,
  type NtCatalogProduct,
} from "../../../packages/theme-base/runtime/nt-cart";

const строка = (
  variant: NtCartLine["variant"],
  productId = "p-1",
): NtCartLine => ({
  id: `${productId}|${variant?.variantCombinationId ?? ""}`,
  productId,
  name: "Товар",
  price: 910,
  image: "",
  quantity: 1,
  variant,
});

const ТИНТ: NtCatalogProduct = {
  id: "p-1",
  name: "Тинт",
  price: 910,
  variantGroups: [
    {
      name: "Оттенок",
      options: [{ value: "Sugar Plum" }, { value: "Berry Glaze" }],
    },
  ],
  variantCombinations: [
    { id: "c-bg", price: 910, options: { Оттенок: "Berry Glaze" } },
    { id: "c-sp", price: 910, options: { Оттенок: "Sugar Plum" } },
  ],
};

const ФУТБОЛКА: NtCatalogProduct = {
  id: "p-2",
  name: "Футболка",
  price: 1500,
  variantGroups: [
    { name: "Размер", options: [{ value: "XS" }, { value: "S" }] },
    {
      name: "Цвет",
      options: [
        { value: "Серый", swatchHex: "#9CA3AF" },
        // Мерчантский цвет с попыткой вывалиться из style — должен быть отброшен.
        { value: "Графит", swatchHex: "rgb(0,0,0);background:url(//evil)" },
      ],
    },
    { name: "Материал", options: [{ value: "Серебро" }] },
  ],
  variantSwatches: [{ value: "Серый", color: "#9CA3AF" }],
  variantCombinations: [
    { id: "c-xs-grey", price: 1500, options: { Размер: "XS", Цвет: "Серый" } },
    {
      id: "c-s-graphite",
      price: 1500,
      options: { Размер: "S", Цвет: "Графит" },
    },
    {
      id: "c-xs-silver",
      price: 1500,
      options: { Размер: "XS", Материал: "Серебро" },
    },
  ],
};

describe("подпись варианта из комбинации", () => {
  it("строка только с номером комбинации получает её опции", () => {
    const { lines, changed } = labelNtLinesFromCatalog(
      [строка({ variantCombinationId: "c-sp" })],
      [ТИНТ],
    );
    expect(changed).toBe(true);
    expect(lines[0].variant?.options).toEqual({ Оттенок: "Sugar Plum" });
  });

  it("подпись = то, что уйдёт в заказ: опции кнопки не спорят с комбинацией", () => {
    const { lines } = labelNtLinesFromCatalog(
      [
        строка({
          variantCombinationId: "c-bg",
          options: { Оттенок: "Sugar Plum" },
        }),
      ],
      [ТИНТ],
    );
    expect(lines[0].variant?.options).toEqual({ Оттенок: "Berry Glaze" });
  });

  it("комбинации нет в каталоге — строка остаётся как есть и НЕ выкидывается", () => {
    // Каталог запекается при публикации, а страница товара досвечивает живой
    // API: номер может быть свежее каталога.
    const исходная = строка({
      variantCombinationId: "c-new",
      options: { Оттенок: "Новый" },
    });
    const { lines, changed } = labelNtLinesFromCatalog([исходная], [ТИНТ]);
    expect(changed).toBe(false);
    expect(lines).toEqual([исходная]);
  });

  it("повторный проход ничего не меняет — без вечной перерисовки", () => {
    const первый = labelNtLinesFromCatalog(
      [строка({ variantCombinationId: "c-xs-grey" }, "p-2")],
      [ФУТБОЛКА],
    );
    const второй = labelNtLinesFromCatalog(первый.lines, [ФУТБОЛКА]);
    expect(второй.changed).toBe(false);
  });

  it("подпись идёт в порядке групп товара, как на экране", () => {
    // У сервиса товаров ключи комбинации в своём порядке: худи на витрине
    // тестировщика — «Размер, Цвет» при показе «Цвет, Размер» (23.09).
    const товар: NtCatalogProduct = {
      ...ФУТБОЛКА,
      variantGroups: [ФУТБОЛКА.variantGroups![1], ФУТБОЛКА.variantGroups![0]],
    };
    const { lines } = labelNtLinesFromCatalog(
      [строка({ variantCombinationId: "c-xs-grey" }, "p-2")],
      [товар],
    );
    expect(Object.keys(lines[0].variant?.options ?? {})).toEqual([
      "Цвет",
      "Размер",
    ]);
  });

  it("полное самолечение при загрузке страницы тоже подписывает", () => {
    const { lines } = reconcileNtLines(
      [строка({ variantCombinationId: "c-sp" })],
      [ТИНТ],
    );
    expect(lines[0].variant?.options).toEqual({ Оттенок: "Sugar Plum" });
  });
});

describe("цвет — кружком", () => {
  it("цвет мерчанта уходит в образец строки, не-цвета — нет", () => {
    const { lines } = labelNtLinesFromCatalog(
      [
        строка({ variantCombinationId: "c-xs-grey" }, "p-2"),
        строка({ variantCombinationId: "c-xs-silver" }, "p-2"),
      ],
      [ФУТБОЛКА],
    );
    expect(lines[0].variant?.swatches).toEqual({ Цвет: "#9CA3AF" });
    // «Материал: Серебро» — не группа-цвет, кружком не становится.
    expect(lines[1].variant?.swatches).toBeUndefined();
  });

  it("мерчантский цвет с хвостом CSS отброшен, цвет берётся по названию", () => {
    const { lines } = labelNtLinesFromCatalog(
      [строка({ variantCombinationId: "c-s-graphite" }, "p-2")],
      [ФУТБОЛКА],
    );
    const цвет = lines[0].variant?.swatches?.Цвет ?? "";
    expect(цвет).not.toMatch(/url|;/);
    expect(цвет).toMatch(/^#[0-9a-f]{3,8}$/i);
  });

  it("разметка: цвет — кружок с названием в подсказке, остальное — текстом", () => {
    const html = variantHtml({
      options: { Размер: "XS", Цвет: "Серый" },
      swatches: { Цвет: "#9CA3AF" },
    });
    document.body.innerHTML = `<p>${html}</p>`;
    const кружок = document.querySelector<HTMLElement>(
      "[data-cart-variant-swatch]",
    );
    expect(кружок?.getAttribute("aria-label")).toBe("Серый");
    expect(кружок?.getAttribute("title")).toBe("Серый");
    expect(кружок?.style.background).toMatch(/156, 163, 175|#9ca3af/i);
    // Глазами видно размер словом и цвет кружком — слова «Серый» в тексте нет.
    expect(document.body.textContent).toContain("XS");
    expect(document.body.textContent).not.toContain("Серый");
  });

  it("рядом с кружком запятой нет: «● M», а слова — через запятую", () => {
    const html = variantHtml({
      options: { Цвет: "Серый", Размер: "M", Объём: "5 мл" },
      swatches: { Цвет: "#9CA3AF" },
    });
    document.body.innerHTML = `<p>${html}</p>`;
    expect(document.body.textContent).toBe(" M, 5 мл");
  });

  it("до сверки с каталогом цвет узнаётся по названию в группе «Цвет»", () => {
    const [размер, цвет] = variantParts({
      options: { Размер: "S", Цвет: "Чёрный" },
    });
    expect(размер.swatch).toBeNull();
    expect(цвет.swatch).not.toBeNull();
  });

  it("оттенок без цвета («Sugar Plum») остаётся словом", () => {
    const [часть] = variantParts({ options: { Оттенок: "Sugar Plum" } });
    expect(часть.swatch).toBeNull();
    expect(variantHtml({ options: { Оттенок: "Sugar Plum" } })).toBe(
      "Sugar Plum",
    );
  });

  it("пары с именами (flux): «Цвет: ●»", () => {
    document.body.innerHTML = `<p>${variantHtml({ options: { Цвет: "Серый" }, swatches: { Цвет: "#9CA3AF" } }, { names: true })}</p>`;
    expect(document.body.textContent?.trim()).toBe("Цвет:");
    expect(document.querySelector("[data-cart-variant-swatch]")).not.toBeNull();
  });

  it("название варианта не исполняется как разметка", () => {
    document.body.innerHTML = `<p>${variantHtml({ options: { Оттенок: '<img src=x onerror="alert(1)">' } })}</p>`;
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).toContain("<img");
  });
});
