/**
 * Задача 5.1 спеки 120: тумблер features.extensionPurchase темы → проп
 * extensionPurchaseEnabled секции «Товар» (форма расширения вместо кнопки
 * покупки). Инжект — в общей точке extractPageBlocks, как у requestsEnabled
 * (requests-product-flag.spec.ts); значение решает манифест темы. Включено
 * включено на flux (решение владельца от 11.10) и vanilla (этап 5 на vanilla).
 */
import { extractPageBlocks } from "../page-blocks";

jest.mock("../theme-manifest-loader", () => ({
  ...jest.requireActual("../theme-manifest-loader"),
  getThemeManifest: jest.fn((id: string) => ({
    features: {
      requests: true,
      extensionPurchase: id === "flux" || id === "vanilla",
    },
  })),
}));

import { getThemeManifest } from "../theme-manifest-loader";

const manifestMocked = jest.mocked(getThemeManifest);

function revisionWithProduct(page: string) {
  return {
    pagesData: {
      [page]: { content: [{ type: "Product", props: { id: "Product-1" } }] },
    },
  } as Record<string, unknown>;
}

async function productProps(
  themeId: string,
  page = "page-product",
): Promise<Record<string, unknown> | undefined> {
  const blocks = await extractPageBlocks(
    revisionWithProduct(page),
    page,
    null,
    themeId,
    "site-1",
  );
  return (blocks || []).find((b) => b.type === "Product")?.props;
}

describe("extensionPurchase: тумблер features.extensionPurchase → Product.extensionPurchaseEnabled", () => {
  it("flux: флаг включён → проп true", async () => {
    expect((await productProps("flux"))?.extensionPurchaseEnabled).toBe(true);
  });

  it("vanilla: флаг включён → проп true", async () => {
    expect((await productProps("vanilla"))?.extensionPurchaseEnabled).toBe(
      true,
    );
  });

  it.each(["rose", "satin", "bloom"])(
    "%s: флаг выключен → пропа нет",
    async (themeId) => {
      expect(
        (await productProps(themeId))?.extensionPurchaseEnabled,
      ).toBeUndefined();
    },
  );

  it("работает и на странице с адресом product", async () => {
    expect(
      (await productProps("flux", "product"))?.extensionPurchaseEnabled,
    ).toBe(true);
  });

  it("только на странице товара, не на остальных", async () => {
    expect(
      (await productProps("flux", "home"))?.extensionPurchaseEnabled,
    ).toBeUndefined();
  });

  it("старый проп requestsEnabled ставится как раньше: выбор между ними делает секция", async () => {
    const props = await productProps("flux");
    expect(props?.requestsEnabled).toBe(true);
    expect(props?.extensionPurchaseEnabled).toBe(true);
  });

  it("реальные манифесты: форму расширения включают flux и vanilla", () => {
    const features = (theme: string) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (
        require(`../../../packages/theme-${theme}/theme.json`) as {
          features?: Record<string, boolean>;
        }
      ).features;
    expect(features("flux")?.extensionPurchase).toBe(true);
    expect(features("vanilla")?.extensionPurchase).toBe(true);
    for (const theme of ["rose", "satin", "bloom"]) {
      expect(features(theme)?.extensionPurchase).not.toBe(true);
    }
  });
});

describe("extensionLook: витринная часть этапа 5 на vanilla — вид формы из темы", () => {
  function manifestMock(themeId: string) {
    return {
      features: {
        requests: true,
        extensionPurchase: themeId === "flux" || themeId === "vanilla",
        extensionLook: themeId === "vanilla" ? "theme" : undefined,
      },
    };
  }

  it("vanilla: флаг extensionLook → проп extensionLook = theme", async () => {
    manifestMocked.mockImplementation(manifestMock as never);
    const props = await productProps("vanilla");
    expect(props?.extensionLook).toBe("theme");
  });

  it("flux и остальные: пропа нет — палитра прототипа PM", async () => {
    manifestMocked.mockImplementation(manifestMock as never);
    expect((await productProps("flux"))?.extensionLook).toBeUndefined();
  });

  it("реальные манифесты: extensionLook = theme только у vanilla", () => {
    const look = (theme: string) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (
        require(`../../../packages/theme-${theme}/theme.json`) as {
          features?: Record<string, string>;
        }
      ).features?.extensionLook;
    expect(look("vanilla")).toBe("theme");
    for (const theme of ["flux", "rose", "satin", "bloom"]) {
      expect(look(theme)).not.toBe("theme");
    }
  });

  it("блок «Товар» ставит атрибут на контейнер формы — режим «как тема» включается", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const product = require("node:fs").readFileSync(
      require("node:path").resolve(
        __dirname,
        "../../../packages/theme-base/blocks/Product/Product.astro",
      ),
      "utf8",
    );
    expect(product).toContain("data-look={extensionLook}");
  });
});
