import type { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import type {
  BuilderAnswer,
  StorefrontBuilderClient,
} from "../../storefront-preview/storefront-builder.client";
import type { ExtensionPlacements } from "../extension-placements";
import {
  ExtensionSectionPreview,
  ExtensionSectionPreviewController,
} from "../extension-section-preview";
import type { PlacementsReply } from "../extension-sections.contract";

// План превью секции расширения в кабинете: тема, видимость секции, место в магазине. Расширение в тестах — test-ext.
const SHOP = "3a9626f7-390d-4a66-bca5-a3b806ca6c1b";

const json = (status: number, body: unknown): BuilderAnswer => ({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body),
});

const LIST = {
  sections: [
    { name: "test-ext:banner", title: "Баннер", extension: { id: "test-ext" } },
    {
      name: "test-ext:popup",
      title: "Окно",
      groups: ["overlay"],
      extension: { id: "test-ext" },
    },
    {
      name: "other-ext:banner",
      title: "Чужой",
      extension: { id: "other-ext" },
    },
  ],
  wrapper: [],
};

const placed = (items: unknown[]): PlacementsReply =>
  ({
    success: true,
    data: { revision: { id: "rev-1", createdAt: "" }, items },
  }) as PlacementsReply;

function build(options: {
  newTheme?: boolean;
  list?: BuilderAnswer;
  placements?: PlacementsReply;
}) {
  const call = jest.fn().mockResolvedValue(options.list ?? json(200, LIST));
  const isNewTheme = jest.fn().mockResolvedValue(options.newTheme ?? true);
  const list = jest.fn().mockResolvedValue(options.placements ?? placed([]));
  const preview = new ExtensionSectionPreview(
    { isNewTheme } as unknown as StorefrontHandoff,
    { call } as unknown as StorefrontBuilderClient,
    { list } as unknown as ExtensionPlacements,
  );
  return { preview, call, isNewTheme, list };
}

describe("ExtensionSectionPreview.plan", () => {
  it("секция видна, в магазине не стоит: ready без места, группа page", async () => {
    const { preview, call, list } = build({});
    await expect(preview.plan(SHOP, "test-ext", "banner")).resolves.toEqual({
      state: "ready",
      section: "test-ext:banner",
      title: "Баннер",
      group: "page",
      placement: null,
    });
    expect(call).toHaveBeenCalledWith("/sections", { shop: SHOP });
    expect(list).toHaveBeenCalledWith({
      shopId: SHOP,
      extensionId: "test-ext",
      section: "banner",
    });
  });

  it("секция стоит в магазине: параметры экземпляра и его группа; видимый важнее скрытого", async () => {
    const hidden = {
      id: "b-1",
      section: "banner",
      list: "page",
      page: { id: "home", name: "Главная" },
      hidden: true,
      settings: { heading: "скрытый" },
    };
    const visible = {
      id: "b-2",
      section: "banner",
      list: "footer",
      page: null,
      hidden: false,
      settings: { heading: "Распродажа" },
    };
    const { preview } = build({ placements: placed([hidden, visible]) });
    const plan = await preview.plan(SHOP, "test-ext", "banner");
    expect(plan).toMatchObject({
      state: "ready",
      group: "footer",
      placement: {
        id: "b-2",
        list: "footer",
        page: null,
        settings: { heading: "Распродажа" },
      },
    });
  });

  it("секция объявила группу overlay и не стоит в магазине: группа overlay", async () => {
    const { preview } = build({});
    await expect(
      preview.plan(SHOP, "test-ext", "popup"),
    ).resolves.toMatchObject({
      state: "ready",
      group: "overlay",
      placement: null,
    });
  });

  it("магазин не на новой теме: no-theme, сборщика не спрашиваем", async () => {
    const { preview, call, list } = build({ newTheme: false });
    await expect(preview.plan(SHOP, "test-ext", "banner")).resolves.toEqual({
      state: "no-theme",
    });
    expect(call).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("секции нет у магазина (расширение не установлено или имя другое): section-not-found", async () => {
    const { preview } = build({});
    await expect(preview.plan(SHOP, "test-ext", "gallery")).resolves.toEqual({
      state: "section-not-found",
    });
    await expect(preview.plan(SHOP, "third-ext", "banner")).resolves.toEqual({
      state: "section-not-found",
    });
  });

  it("секция другого расширения с тем же именем не подменяет нашу", async () => {
    const { preview } = build({});
    await expect(
      preview.plan(SHOP, "other-ext", "banner"),
    ).resolves.toMatchObject({
      state: "ready",
      section: "other-ext:banner",
      title: "Чужой",
    });
  });

  it("id расширения или имя секции не по правилу: section-not-found без походов в сеть", async () => {
    const { preview, call, isNewTheme } = build({});
    await expect(preview.plan(SHOP, "Test_Ext", "banner")).resolves.toEqual({
      state: "section-not-found",
    });
    await expect(preview.plan(SHOP, "test-ext", "../x")).resolves.toEqual({
      state: "section-not-found",
    });
    expect(call).not.toHaveBeenCalled();
    expect(isNewTheme).not.toHaveBeenCalled();
  });

  it("сборщик не ответил или ответил не по формату: unavailable / section-not-found", async () => {
    const down = build({
      list: { status: 502, contentType: "text/plain", body: "нет" },
    });
    await expect(
      down.preview.plan(SHOP, "test-ext", "banner"),
    ).resolves.toMatchObject({ state: "unavailable" });
    const broken = build({
      list: { status: 200, contentType: "text/plain", body: "не json" },
    });
    await expect(
      broken.preview.plan(SHOP, "test-ext", "banner"),
    ).resolves.toEqual({ state: "section-not-found" });
  });

  it("места секций не прочитались: unavailable с причиной", async () => {
    const { preview } = build({
      placements: {
        success: false,
        code: "unavailable",
        message: "база молчит",
      },
    });
    await expect(preview.plan(SHOP, "test-ext", "banner")).resolves.toEqual({
      state: "unavailable",
      message: "база молчит",
    });
  });
});

describe("ExtensionSectionPreviewController", () => {
  function reply() {
    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res;
  }

  it("ready и no-theme — 200 без кэша; unavailable — 502", async () => {
    const plans = [
      { state: "no-theme" },
      { state: "unavailable", message: "x" },
    ] as const;
    const statuses: number[] = [];
    for (const plan of plans) {
      const controller = new ExtensionSectionPreviewController({
        plan: jest.fn().mockResolvedValue(plan),
      } as unknown as ExtensionSectionPreview);
      const res = reply();
      await controller.plan(SHOP, "test-ext", "banner", res as never);
      statuses.push(res.status.mock.calls[0][0] as number);
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      expect(res.json).toHaveBeenCalledWith(plan);
    }
    expect(statuses).toEqual([200, 502]);
  });
});
