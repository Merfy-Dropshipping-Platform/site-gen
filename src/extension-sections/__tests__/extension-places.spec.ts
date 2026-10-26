import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StoreContentService } from "../../content/store-content.service";
import type * as schema from "../../db/schema";
import type { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import type {
  BuilderAnswer,
  StorefrontBuilderClient,
} from "../../storefront-preview/storefront-builder.client";
import {
  ExtensionPlaces,
  PLACES_PATH,
  placedSections,
  type ExtensionPlace,
} from "../extension-places";
import { ExtensionSectionsController } from "../extension-sections.controller";

// Секция расширения встаёт сама (блок 12 «Секций и SDK», часть 12д, Р12д-12…Р12д-14): после включения расширения —
// экземпляр сразу после секции с местом блоков, обычной записью ревизии. Расширение — test-ext.
const SHOP = "3a9626f7-390d-4a66-bca5-a3b806ca6c1b";
const PLACE: ExtensionPlace = {
  section: "test-ext:reviews",
  autoPlace: "product",
  hosts: ["shop:product"],
};
const idOf = (base: string) => `${base}-1a2b3c4d`;
const HERO = { id: "hero-1", section: "shop:hero", settings: {} };
const PRODUCT = { id: "product-1", section: "shop:product", settings: {} };
const RELATED = { id: "related-1", section: "shop:related", settings: {} };
const SECTIONS = { home: [HERO], product: [PRODUCT, RELATED] };
const ADDED = {
  id: "reviews-1a2b3c4d",
  section: "test-ext:reviews",
  settings: {},
};
const SITE = {
  id: SHOP,
  tenantId: "tenant-1",
  themeId: "nova",
  currentRevisionId: "rev-1",
  publicUrl: null,
  name: "Магазин",
  contentModel: null,
};

const json = (status: number, body: unknown): BuilderAnswer => ({
  status,
  contentType: "application/json; charset=utf-8",
  body: JSON.stringify(body),
});

function placesWith(
  answer: BuilderAnswer,
  document: Record<string, unknown> = { pages: [], sections: SECTIONS },
) {
  const call = jest.fn().mockResolvedValue(answer);
  const load = jest.fn().mockResolvedValue({ document, version: "rev-1" });
  const save = jest.fn().mockResolvedValue({ version: "rev-2" });
  const where = jest.fn().mockResolvedValue([SITE]);
  const db = { select: () => ({ from: () => ({ where }) }) };
  const places = new ExtensionPlaces(
    db as unknown as NodePgDatabase<typeof schema>,
    { call } as unknown as StorefrontBuilderClient,
    { load, save } as unknown as StoreContentService,
  );
  return { places, call, load, save };
}

describe("placedSections", () => {
  it("экземпляр — сразу после секции с местом блоков, настройки пустые; остальное как было", () => {
    expect(placedSections(SECTIONS, [PLACE], idOf)).toEqual({
      sections: { home: [HERO], product: [PRODUCT, ADDED, RELATED] },
      added: ["test-ext:reviews"],
    });
  });

  it.each<[string, unknown]>([
    [
      "экземпляр уже есть (на другой странице, скрытый)",
      { ...SECTIONS, home: [{ ...ADDED, id: "r-1", hidden: true }] },
    ],
    ["секции с местом блоков нет", { home: [HERO] }],
    ["у нынешних тем в sections списки имён", { home: ["Hero", "Footer"] }],
    ["ключа sections нет", undefined],
  ])("%s — ничего не меняется (null)", (_name, sections) => {
    expect(placedSections(sections, [PLACE], idOf)).toBeNull();
  });
});

describe("ExtensionPlaces.place", () => {
  it("встала: запись от базы, reject-conflicts, система, ops, операция extension-place; только своё расширение", async () => {
    const other = { ...PLACE, section: "other-ext:badge" };
    const { places, call, save } = placesWith(
      json(200, { places: [PLACE, other] }),
    );
    expect(await places.place(SHOP, "test-ext")).toEqual({
      status: "placed",
      sections: ["test-ext:reviews"],
    });
    expect(call).toHaveBeenCalledWith(PLACES_PATH, { shop: SHOP });
    const [siteId, params] = save.mock.calls[0];
    expect(siteId).toBe(SHOP);
    expect(params).toMatchObject({
      mode: "on-base",
      base: "rev-1",
      tenantId: "tenant-1",
      actor: "system",
      source: "ops",
      mergePolicy: "reject-conflicts",
      meta: {
        operation: "extension-place",
        extension: "test-ext",
        sections: ["test-ext:reviews"],
      },
    });
    expect(params.document.pages).toEqual([]);
    expect(params.document.sections.product).toEqual([
      PRODUCT,
      expect.objectContaining({ section: "test-ext:reviews", settings: {} }),
      RELATED,
    ]);
  });

  it("у расширения нет секций с autoPlace — ревизия не читается и не пишется", async () => {
    const { places, load, save } = placesWith(
      json(200, { places: [{ ...PLACE, section: "other-ext:badge" }] }),
    );
    expect(await places.place(SHOP, "test-ext")).toEqual({ status: "none" });
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("экземпляр уже есть — записи нет", async () => {
    const document = {
      sections: { product: [PRODUCT, { ...ADDED, id: "r-1" }] },
    };
    const { places, save } = placesWith(
      json(200, { places: [PLACE] }),
      document,
    );
    expect(await places.place(SHOP, "test-ext")).toEqual({ status: "none" });
    expect(save).not.toHaveBeenCalled();
  });

  it.each<[string, BuilderAnswer]>([
    [
      "сборщик ответил 502",
      json(502, { problems: ["сервис расширений не ответил"] }),
    ],
    ["ответ не той формы", json(200, { places: "нет" })],
  ])("%s — failed, записи нет", async (_name, answer) => {
    const { places, save } = placesWith(answer);
    expect(await places.place(SHOP, "test-ext")).toMatchObject({
      status: "failed",
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe("sites.extension.toggled и место по умолчанию", () => {
  function controllerWith(newTheme: boolean) {
    const order: string[] = [];
    const place = jest.fn(async () => {
      order.push("place");
      return { status: "none" };
    });
    const notify = jest.fn(async () => {
      order.push("notify");
    });
    const isNewTheme = jest.fn().mockResolvedValue(newTheme);
    const controller = new ExtensionSectionsController(
      { call: jest.fn() } as unknown as StorefrontBuilderClient,
      { notify, isNewTheme } as unknown as StorefrontHandoff,
      { place } as unknown as ExtensionPlaces,
    );
    return { controller, place, order };
  }
  const message = (state: string) => ({
    shopId: SHOP,
    extensionId: "test-ext",
    state,
  });

  it("enabled, новая тема — сначала секции встают, потом пересборка", async () => {
    const { controller, place, order } = controllerWith(true);
    await controller.toggled(message("enabled"));
    expect(place).toHaveBeenCalledWith(SHOP, "test-ext");
    expect(order).toEqual(["place", "notify"]);
  });

  it.each<[string, string, boolean]>([
    ["disabled", "disabled", true],
    ["enabled у магазина нынешней темы", "enabled", false],
  ])(
    "%s — секции не ставятся, пересборка как раньше",
    async (_name, state, newTheme) => {
      const { controller, place, order } = controllerWith(newTheme);
      await controller.toggled(message(state));
      expect(place).not.toHaveBeenCalled();
      expect(order).toEqual(["notify"]);
    },
  );
});
