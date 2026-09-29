/**
 * flux, секция «Товар»: цифра счётчика «− 1 +» — роль «Заголовок» схемы
 * секции, как «−»/«+» рядом и как цифра степпера карточки (4df5d3e7).
 *
 * Баг 28.09: на Схеме 5 цифра белая на белом. Цифра была ролью «Кнопка»
 * (`--color-button-bg`), а 26.09 (21779a49) у Схемы 5 flux «Кнопка» стала
 * белой — под контурную «В корзину». Замер до правки (390, заводские схемы;
 * цифра | фон | контраст): scheme-1 30 41 82 | 0 0 0 | 1,49;
 * scheme-2 30 41 82 | 255 255 255 | 14,05; scheme-5 255 255 255 | 255 255 255 | 1.
 * После: цифра = «Заголовок» схемы, контраст 21 на всех трёх.
 *
 * Пропсы — заводские: «Товар» главной и страницы товара flux (pages/*.json).
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Browser } from "playwright";

import { buildTokensCss, themeSchemeToMerchantShape } from "../tokens-css";
import { renderSections } from "../../../scripts/qa/lib/render";
import { themeCss } from "../../../scripts/qa/lib/tailwind-css";

const ROOT = resolve(__dirname, "..", "..", "..");
const SCHEMES_UNDER_TEST = ["scheme-1", "scheme-2", "scheme-5"];
const PAGES = ["home", "product"] as const;

type Scheme = { id: string; heading: string };
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "packages/theme-flux/theme.json"), "utf8"),
);
const schemes = (manifest.colorSchemes as unknown[]).map((s) =>
  themeSchemeToMerchantShape(s as never),
) as unknown as Scheme[];
const tokens = buildTokensCss({ colorSchemes: schemes }, "flux");

const hexToRgb = (hex: string): string => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

function productProps(
  pageName: (typeof PAGES)[number],
): Record<string, unknown> {
  const page = JSON.parse(
    readFileSync(
      resolve(ROOT, `packages/theme-flux/pages/${pageName}.json`),
      "utf8",
    ),
  );
  const block = (
    page.content as Array<{ type: string; props: Record<string, unknown> }>
  ).find((b) => b.type === "Product");
  if (!block) throw new Error(`flux/${pageName}: нет секции «Товар»`);
  return block.props;
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  shared ??= await chromium
    .launch()
    .catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
}, 90_000);

describe("flux «Товар»: цифра счётчика — «Заголовок» схемы секции", () => {
  it.each(PAGES)(
    "%s: схемы 1, 2, 5",
    async (pageName) => {
      const props = productProps(pageName);
      const rendered = renderSections(
        "flux",
        SCHEMES_UNDER_TEST.map((colorScheme) => ({
          block: "Product",
          props: { ...props, colorScheme },
        })),
      );
      const got: unknown[] = [];
      const want: unknown[] = [];
      for (const [i, id] of SCHEMES_UNDER_TEST.entries()) {
        const html = rendered[i]?.html;
        if (!html)
          throw new Error(
            `flux/${pageName}/${id}: не отрисовалось: ${rendered[i]?.error ?? "нет HTML"}`,
          );
        const n = id.replace("scheme-", "");
        const ctx = await (
          await browser()
        ).newContext({ viewport: { width: 390, height: 900 } });
        const page = await ctx.newPage();
        await page.route("**/*", (route) =>
          /^(data:|about:)/.test(route.request().url())
            ? route.continue()
            : route.abort(),
        );
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss("flux")}</style><style id="__merfy_tokens_css">${tokens}</style></head><body><div class="color-scheme-${n}">${html.replace(/<script\b[\s\S]*?<\/script>/gi, "")}</div></body></html>`,
          { waitUntil: "domcontentloaded" },
        );
        const colors = await page.$$eval("[data-cfg-qty-value]", (els) =>
          els
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => getComputedStyle(el).color),
        );
        await ctx.close();
        const heading = hexToRgb(schemes.find((s) => s.id === id)!.heading);
        got.push({ схема: id, цифры: colors });
        want.push({
          схема: id,
          цифры:
            colors.length > 0
              ? colors.map(() => heading)
              : ["цифра не отрисовалась"],
        });
      }
      expect(got).toEqual(want);
    },
    120_000,
  );
});
