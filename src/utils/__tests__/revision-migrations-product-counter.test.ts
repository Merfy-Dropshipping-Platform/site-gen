import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { migrateRevisionData } from "../revision-migrations";

/**
 * Силуэт счётчика количества принадлежит ТЕМЕ, а не данным мерчанта.
 *
 * Баг-репорт 14.09: после правки «счётчик берёт оформление своей темы»
 * bloom, satin и vanilla на живых витринах встали как задумано, а rose
 * остался прежним — 96×26 без рамки и радиуса.
 *
 * Причина: `packages/theme-rose/pages/product.json` (и flux) пинят
 * `visualConfig` ВНУТРЬ пропов блока, то есть внутрь данных мерчанта. Рендер
 * мерджит `deepMergeBlockProps(blockDefaults, props)` — пропы ревизии сильнее
 * `theme.json`, поэтому семя `counter.variant: 'inline'` перебивало новый
 * `boxed` темы. У bloom/satin/vanilla `visualConfig` в сиде нет, и у них тема
 * доезжала: расхождение сидело ровно в двух темах и выглядело как «правка не
 * применилась к rose».
 *
 * Заметить это было нечем и раньше: сид rose повторял `DEFAULT_VISUAL_CONFIG`
 * слово в слово, так что «сид перебивает тему» и «тема применилась» давали
 * одинаковый HTML во всех полях, кроме `counter` — единственного, который
 * когда-либо менялся.
 *
 * Миграция снимает ТОЛЬКО `visualConfig.counter`: мерчанту этот ключ не
 * показывают (в `Product.puckConfig` для него нет полей), значит его значение
 * в ревизии не выбор мерчанта, а слепок темы на момент создания сайта.
 * Остальной `visualConfig` не трогается: `gallery`/`variantsType`/
 * `showDescription` читает ещё и собственный порт flux, и их снятие поменяло бы
 * вид секции, о котором никто не просил.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const productBlock = (
  data: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const pages = data.pagesData as
    | Record<
        string,
        { content?: { type?: string; props?: Record<string, unknown> }[] }
      >
    | undefined;
  return pages?.["page-product"]?.content?.find((b) => b?.type === "Product")
    ?.props;
};

const revisionWith = (props: Record<string, unknown>) => ({
  pagesData: {
    "page-product": {
      content: [{ type: "Product", props: { id: "Product-1", ...props } }],
    },
  },
});

describe("visualConfig.counter — силуэт темы, а не данные мерчанта", () => {
  it("снимает counter, вшитый сидом в пропы блока", () => {
    const out = migrateRevisionData(
      revisionWith({ visualConfig: { counter: { variant: "inline" } } }),
      "rose",
    );
    const props = productBlock(out);
    expect(props?.visualConfig).toEqual({});
  });

  it("остальной visualConfig остаётся нетронутым", () => {
    const out = migrateRevisionData(
      revisionWith({
        visualConfig: {
          gallery: { variant: "wrap-large", showDiscountBadge: true },
          variantsType: "chips",
          counter: { variant: "inline" },
          showDescription: true,
        },
      }),
      "rose",
    );
    expect(productBlock(out)?.visualConfig).toEqual({
      gallery: { variant: "wrap-large", showDiscountBadge: true },
      variantsType: "chips",
      showDescription: true,
    });
  });

  it("работает для любой темы, не только rose (сиды меняются)", () => {
    for (const theme of ["rose", "flux", "bloom", "satin", "vanilla"]) {
      const out = migrateRevisionData(
        revisionWith({ visualConfig: { counter: { variant: "pill" } } }),
        theme,
      );
      expect(productBlock(out)?.visualConfig).toEqual({});
    }
  });

  it("блок без visualConfig не меняется", () => {
    const out = migrateRevisionData(
      revisionWith({ padding: { top: 40, bottom: 80 } }),
      "rose",
    );
    const props = productBlock(out);
    expect(props).toBeDefined();
    expect("visualConfig" in (props ?? {})).toBe(false);
    expect(props?.padding).toEqual({ top: 40, bottom: 80 });
  });

  it("чужие блоки на странице не задеты", () => {
    const out = migrateRevisionData(
      {
        pagesData: {
          "page-product": {
            content: [
              {
                type: "Product",
                props: {
                  id: "Product-1",
                  visualConfig: { counter: { variant: "inline" } },
                },
              },
              {
                type: "PopularProducts",
                props: {
                  id: "Popular-1",
                  visualConfig: { counter: { variant: "inline" } },
                },
              },
            ],
          },
        },
      },
      "rose",
    );
    const pages = (
      out.pagesData as Record<
        string,
        { content: { type: string; props: Record<string, unknown> }[] }
      >
    )["page-product"];
    const popular = pages.content.find((b) => b.type === "PopularProducts");
    expect(popular?.props.visualConfig).toEqual({
      counter: { variant: "inline" },
    });
  });

  it("снимает counter на ЛЮБОЙ странице, где стоит блок «Товар»", () => {
    const out = migrateRevisionData(
      {
        pagesData: {
          "page-home": {
            content: [
              {
                type: "Product",
                props: {
                  id: "Product-home",
                  visualConfig: { counter: { variant: "inline" } },
                },
              },
            ],
          },
        },
      },
      "rose",
    );
    const pages = out.pagesData as Record<
      string,
      { content: { type: string; props: Record<string, unknown> }[] }
    >;
    const block = pages["page-home"].content.find((b) => b.type === "Product");
    expect(block?.props.visualConfig).toEqual({});
  });
});

/**
 * Сиды новых сайтов. Миграция чинит УЖЕ созданные магазины, но сеять заново
 * ключ, который она снимает, нельзя — иначе каждая новая витрина рождается со
 * сломанным счётчиком и лечится только следующим чтением ревизии.
 */
describe("сиды страницы товара не пинят силуэт счётчика", () => {
  it.each(["rose", "bloom", "satin", "flux", "vanilla"])(
    "у %s в pages/product.json нет visualConfig.counter",
    (theme) => {
      const raw = JSON.parse(
        readFileSync(
          resolve(
            SITES_ROOT,
            "packages",
            `theme-${theme}`,
            "pages",
            "product.json",
          ),
          "utf8",
        ),
      ) as
        | { type?: string; props?: Record<string, unknown> }[]
        | { content?: { type?: string; props?: Record<string, unknown> }[] };
      const content = Array.isArray(raw) ? raw : (raw.content ?? []);
      const props = content.find((b) => b?.type === "Product")?.props;
      const visual = props?.visualConfig as Record<string, unknown> | undefined;
      expect(visual === undefined || !("counter" in visual)).toBe(true);
    },
  );
});
