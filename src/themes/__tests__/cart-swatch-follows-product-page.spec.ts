/**
 * @jest-environment jsdom
 *
 * Цвет варианта в корзине — той же формы, что на странице товара.
 *
 * Владелец, 23.09: «если там кружок — то кружок, если квадратик — то
 * квадратик… как карточка товара». Форму задаёт настройка «Вариации» секции
 * «Товар» (круг / квадрат / нет). Корзина живёт на всех страницах, поэтому
 * сборка и превью кладут форму глобалом `__MERFY_VARIANT_SWATCH__`, и
 * вычисляется он ТЕМ ЖЕ правилом, что рисует страница товара
 * (`runtime/variant-display.ts`).
 *
 * Проверка сравнивает не исходники, а результат: настоящий рендер страницы
 * товара (общий блок theme-base и порт flux) против того, что нарисует
 * корзина при глобале, посчитанном из той же ревизии.
 */
import {
  resolveVariantDisplay,
  variantSwatchShapeFromRevision,
} from "../../../packages/theme-base/runtime/variant-display";
import { variantParts } from "../../../packages/theme-base/runtime/nt-cart";
import { renderSections } from "../../../scripts/qa/lib/render";

const ТОВАР = {
  id: "tee",
  name: "Футболка",
  title: "Футболка",
  slug: "tee",
  handle: "tee",
  image: "",
  images: [],
  price: 1500,
  basePrice: 1500,
  compareAtPrice: null,
  description: "",
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

type Форма = "circle" | "square" | "none";

/** Как страница товара нарисовала цвет «Чёрный»: форма образца или словом. */
function формаНаСтранице(html: string): Форма {
  document.body.innerHTML = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  const образец = document.querySelector<HTMLElement>("[data-variant-swatch]");
  if (!образец) return "none";
  const класс = образец.getAttribute("class") ?? "";
  const стиль = образец.getAttribute("style") ?? "";
  if (/rounded-full/.test(класс) || /border-radius:\s*9999px/.test(стиль))
    return "circle";
  if (/rounded-none/.test(класс) || /border-radius:\s*0/.test(стиль))
    return "square";
  throw new Error(
    `форма образца не распознана: class="${класс}" style="${стиль}"`,
  );
}

/** Как корзина нарисует тот же цвет при глобале из той же ревизии. */
function формаВКорзине(variants: unknown): Форма {
  const ревизия = {
    pagesData: {
      "page-product": { content: [{ type: "Product", props: { variants } }] },
    },
  };
  const форма = variantSwatchShapeFromRevision(ревизия);
  (
    window as unknown as { __MERFY_VARIANT_SWATCH__?: unknown }
  ).__MERFY_VARIANT_SWATCH__ = форма;
  const [часть] = variantParts({ options: { Цвет: "Чёрный" } });
  return часть.swatch ? часть.shape : "none";
}

function страница(тема: string, variants: unknown): string {
  const [r] = renderSections(
    тема,
    [
      {
        block: "Product",
        props: {
          id: "Product-1",
          productId: "tee",
          colorScheme: "scheme-1",
          siteId: "site-1",
          variants,
        },
      },
    ],
    { MERFY_QA_STUB_PRODUCT: JSON.stringify(ТОВАР) },
  );
  if (r.error) throw new Error(`${тема}: ${r.error}`);
  return r.html ?? "";
}

const СЛУЧАИ: Array<[string, unknown, Форма]> = [
  ["«Вариации: Круг»", { displayStyle: "button", shape: "circle" }, "circle"],
  [
    "«Вариации: Квадрат»",
    { displayStyle: "button", shape: "square" },
    "square",
  ],
  [
    "«Вариации: Нет» — словами",
    { displayStyle: "button", shape: "none" },
    "none",
  ],
  ["старая ревизия: одно поле style=square", { style: "square" }, "square"],
  ["настройки не трогали — словами", undefined, "none"],
];

afterEach(() => {
  delete (window as unknown as { __MERFY_VARIANT_SWATCH__?: unknown })
    .__MERFY_VARIANT_SWATCH__;
});

describe("корзина рисует цвет той же формой, что страница товара", () => {
  // rose — общий блок theme-base (его же берут bloom/satin/vanilla), flux — свой порт.
  for (const тема of ["rose", "flux"] as const) {
    for (const [название, variants, ожидаемая] of СЛУЧАИ) {
      it(`${тема}: ${название}`, () => {
        const наСтранице = формаНаСтранице(страница(тема, variants));
        const вКорзине = формаВКорзине(variants);
        expect({ тема, наСтранице, вКорзине }).toEqual({
          тема,
          наСтранице: ожидаемая,
          вКорзине: ожидаемая,
        });
      });
    }
  }
});

describe("правило показа вариантов", () => {
  it.each([
    [
      { displayStyle: "list", shape: "square" },
      { displayStyle: "list", shape: "square" },
    ],
    [{ style: "list" }, { displayStyle: "list", shape: "none" }],
    [{ style: "circle" }, { displayStyle: "button", shape: "circle" }],
    [
      { shape: "none", style: "circle" },
      { displayStyle: "button", shape: "none" },
    ],
    [{ shape: "треугольник" }, { displayStyle: "button", shape: "none" }],
    [null, { displayStyle: "button", shape: "none" }],
  ])("%j → %j", (variants, ожидается) => {
    expect(resolveVariantDisplay(variants)).toEqual(ожидается);
  });

  it("нет секции «Товар» в ревизии — глобал не ставится", () => {
    expect(variantSwatchShapeFromRevision({ pagesData: {} })).toBeNull();
    expect(variantSwatchShapeFromRevision(null)).toBeNull();
  });
});
