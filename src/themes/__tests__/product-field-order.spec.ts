/**
 * Перетаскивание параметров секции «Товар» (владелец 25.09, вслед за
 * «Изображением», «Основным текстом» и «Подпиской на рассылку»).
 *
 * Конструктор пишет порядок восьми строк дерева (реестр
 * SECTION_FIELDS.Product, packages/theme-base/runtime/field-order.ts) в
 * `props.fieldOrder`. Рисуют «Товар» два модуля: общий блок theme-base
 * (rose, vanilla, satin, bloom) и порт flux FeaturedProduct (десктоп и мобила
 * в одной разметке). Проверяем рендером настоящих скомпилированных модулей —
 * тем, что уходит в превью и на витрину: порядок узлов
 * `data-puck-subsection-field` совпадает с `fieldOrder` (строки, которых тема
 * при этих данных не рисует, просто пропускаются), «глаз» прячет строку при
 * любом порядке. Объявление `fieldOrder` в puck-config сторожит
 * section-field-order.spec.ts (он обходит весь реестр).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { SECTION_FIELDS } from "../../../packages/theme-base/runtime/field-order";
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const REGISTRY = SECTION_FIELDS.Product as readonly string[];

/** Товар с вариантами, старой ценой и описанием — видны все восемь строк. */
const STUB = {
  id: "tee",
  name: "Футболка",
  title: "Футболка",
  slug: "tee",
  handle: "tee",
  image: "/p1-1.png",
  images: ["/p1-1.png", "/p1-2.png", "/p1-3.png"],
  price: 1500,
  basePrice: 1500,
  compareAtPrice: 2500,
  description: "Описание товара MK_DESC",
  collectionIds: [],
  hasVariants: true,
  variantGroups: [
    {
      id: "g-color",
      name: "Цвет",
      position: 0,
      options: [
        {
          id: "o-black",
          value: "Чёрный",
          position: 0,
          images: [],
          swatchHex: null,
        },
        {
          id: "o-white",
          value: "Белый",
          position: 1,
          images: [],
          swatchHex: null,
        },
      ],
    },
  ],
  variantCombinations: [
    {
      id: "c-black",
      options: { Цвет: "Чёрный" },
      price: 1500,
      available: true,
      quantity: 5,
    },
    {
      id: "c-white",
      options: { Цвет: "Белый" },
      price: 1500,
      available: true,
      quantity: 5,
    },
  ],
};

const PROPS = {
  id: "Product-1",
  colorScheme: "1",
  productId: "tee",
  siteId: "site-1",
  text: { content: "MK_BRAND" },
};

function render(theme: string, extra: Record<string, unknown>): string {
  const [row] = renderSections(
    theme,
    [{ block: "Product", props: { ...PROPS, ...extra } }],
    { MERFY_QA_STUB_PRODUCT: JSON.stringify(STUB) },
  );
  if (row.error) throw new Error(`${theme}: ${row.error}`);
  return row.html ?? "";
}

/**
 * Порядок строк в разметке. `pick` выбирает вхождение узла: у flux одна
 * разметка несёт десктоп (первое вхождение) и мобилу (последнее); у общего
 * блока вхождение одно, и оба прохода совпадают.
 */
type Pick = (html: string, needle: string) => number;
const FIRST: Pick = (html, needle) => html.indexOf(needle);
const LAST: Pick = (html, needle) => html.lastIndexOf(needle);

function drawnOrder(html: string, pick: Pick): string[] {
  return REGISTRY.map((field) => ({
    field,
    at: pick(html, `data-puck-subsection-field="${field}"`),
  }))
    .filter(({ at }) => at > -1)
    .sort((a, b) => a.at - b.at)
    .map(({ field }) => field);
}

/** Реестр, обратный, «шапка» вразнобой с остальными, сдвиги. */
const ORDERS: string[][] = [
  [...REGISTRY],
  [...REGISTRY].reverse(),
  [
    "title",
    "variants",
    "text",
    "buttons",
    "price",
    "share",
    "quantity",
    "description",
  ],
  [
    "price",
    "title",
    "text",
    "variants",
    "quantity",
    "buttons",
    "description",
    "share",
  ],
  [
    "share",
    "text",
    "title",
    "price",
    "variants",
    "quantity",
    "buttons",
    "description",
  ],
  [
    "variants",
    "quantity",
    "buttons",
    "description",
    "share",
    "text",
    "title",
    "price",
  ],
  [
    "text",
    "description",
    "title",
    "quantity",
    "price",
    "buttons",
    "variants",
    "share",
  ],
];

describe.each(THEMES)("«Товар» — порядок строк, тема %s", (theme) => {
  const present = drawnOrder(render(theme, {}), FIRST);

  it("без fieldOrder — порядок реестра, строк не меньше семи", () => {
    expect(present.length).toBeGreaterThanOrEqual(7);
    expect(present).toEqual(REGISTRY.filter((f) => present.includes(f)));
  });

  it.each(ORDERS.map((order) => [order.join(" → "), order]))(
    "fieldOrder %s",
    (_label, order) => {
      const html = render(theme, { fieldOrder: order });
      const expected = order.filter((f) => present.includes(f));
      expect(drawnOrder(html, FIRST)).toEqual(expected);
      expect(drawnOrder(html, LAST)).toEqual(expected);
    },
  );

  it("«глаз» прячет название при переставленном порядке", () => {
    const order = [...REGISTRY].reverse();
    const html = render(theme, { fieldOrder: order, hiddenFields: ["title"] });
    const expected = order.filter((f) => f !== "title" && present.includes(f));
    expect(drawnOrder(html, FIRST)).toEqual(expected);
  });
});
