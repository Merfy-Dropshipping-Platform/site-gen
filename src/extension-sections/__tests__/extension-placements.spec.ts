import { readFileSync } from "fs";
import * as path from "path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StoreContentService } from "../../content/store-content.service";
import type * as schema from "../../db/schema";
import type { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import type { StorefrontBuilderClient } from "../../storefront-preview/storefront-builder.client";
import { ExtensionPlacements, placementItemsOf } from "../extension-placements";
import type { ExtensionPlaces } from "../extension-places";
import {
  PLACEMENTS_LIMIT,
  PlacementsReplySchema,
  PlacementsRequestSchema,
} from "../extension-sections.contract";
import { ExtensionSectionsController } from "../extension-sections.controller";

// Где стоят секции расширения (RPC sites.extension.placements): чтение текущей правки магазина, только секции
// запрошенного расширения. Расширения в тестах — test-ext и other-ext.
interface Examples {
  placements: {
    requests: {
      valid: unknown[];
      invalid: { why: string; request: unknown }[];
    };
    replies: { valid: unknown[]; invalid: { why: string; reply: unknown }[] };
  };
}
const examples = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/extension-sections.examples.json"),
    "utf8",
  ),
) as Examples;

const SHOP = "3a9626f7-390d-4a66-bca5-a3b806ca6c1b";
const SITE = {
  id: SHOP,
  themeId: "nova",
  currentRevisionId: "rev-1",
  publicUrl: null,
  name: "Магазин",
  contentModel: null,
};
const DOCUMENT = {
  pages: [
    { id: "home", name: "Главная" },
    { id: "about", name: 7 },
  ],
  sections: {
    home: [
      { id: "hero-1", section: "shop:hero", settings: {} },
      {
        id: "gallery-1",
        section: "test-ext:gallery",
        settings: { item: "rec-1" },
      },
      { id: "badge-1", section: "other-ext:badge", settings: {} },
    ],
    about: [
      {
        id: "gallery-2",
        section: "test-ext:gallery",
        settings: { item: "rec-2" },
        hidden: true,
      },
      "не секция",
      { id: "", section: "test-ext:gallery" },
    ],
    header: [{ id: "bar-1", section: "test-ext:bar", settings: "битые" }],
    footer: [],
    overlay: [{ id: "popup-1", section: "test-ext:popup" }],
    broken: "не список",
  },
};

describe("placementItemsOf", () => {
  it("секции расширения по порядку ключей: страница с названием, шапка, поверх страниц; чужие и магазина — нет", () => {
    expect(placementItemsOf(DOCUMENT, "test-ext")).toEqual([
      {
        id: "gallery-1",
        section: "gallery",
        list: "page",
        page: { id: "home", name: "Главная" },
        hidden: false,
        settings: { item: "rec-1" },
      },
      {
        id: "gallery-2",
        section: "gallery",
        list: "page",
        page: { id: "about", name: null },
        hidden: true,
        settings: { item: "rec-2" },
      },
      {
        id: "bar-1",
        section: "bar",
        list: "header",
        page: null,
        hidden: false,
        settings: {},
      },
      {
        id: "popup-1",
        section: "popup",
        list: "overlay",
        page: null,
        hidden: false,
        settings: {},
      },
    ]);
  });

  it("имя секции — только она; расширение без секций — пусто", () => {
    expect(
      placementItemsOf(DOCUMENT, "test-ext", "gallery").map((item) => item.id),
    ).toEqual(["gallery-1", "gallery-2"]);
    expect(placementItemsOf(DOCUMENT, "test-ext", "nope")).toEqual([]);
    expect(placementItemsOf(DOCUMENT, "absent-ext")).toEqual([]);
  });

  it("префикс считается по двоеточию: расширение test-ext не забирает test-ext-two", () => {
    const document = {
      sections: {
        home: [{ id: "x-1", section: "test-ext-two:gallery", settings: {} }],
      },
    };
    expect(placementItemsOf(document, "test-ext")).toEqual([]);
  });

  it("нет sections или не объект — пусто", () => {
    expect(placementItemsOf({}, "test-ext")).toEqual([]);
    expect(placementItemsOf({ sections: [] }, "test-ext")).toEqual([]);
  });

  it("больше предела не отдаётся", () => {
    const list = Array.from({ length: PLACEMENTS_LIMIT + 20 }, (_, index) => ({
      id: `g-${index}`,
      section: "test-ext:gallery",
      settings: {},
    }));
    expect(
      placementItemsOf({ sections: { home: list } }, "test-ext"),
    ).toHaveLength(PLACEMENTS_LIMIT);
  });
});

function placementsWith(options: {
  site?: typeof SITE | null;
  load?: jest.Mock;
  envelope?: jest.Mock;
}) {
  const where = jest
    .fn()
    .mockResolvedValue(options.site === null ? [] : [options.site ?? SITE]);
  const db = { select: () => ({ from: () => ({ where }) }) };
  const load =
    options.load ??
    jest.fn().mockResolvedValue({ document: DOCUMENT, version: "rev-1" });
  const envelopeOrNull =
    options.envelope ??
    jest
      .fn()
      .mockResolvedValue({ createdAt: new Date("2026-11-03T10:00:00Z") });
  const placements = new ExtensionPlacements(
    db as unknown as NodePgDatabase<typeof schema>,
    { load, envelopeOrNull } as unknown as StoreContentService,
  );
  return { placements, load, envelopeOrNull };
}

describe("ExtensionPlacements.list", () => {
  it("текущая правка: id и время ревизии, секции расширения; ответ проходит договор", async () => {
    const { placements, load } = placementsWith({});
    const reply = await placements.list({
      shopId: SHOP,
      extensionId: "test-ext",
    });
    expect(PlacementsReplySchema.safeParse(reply).success).toBe(true);
    expect(reply.success && reply.data.revision).toEqual({
      id: "rev-1",
      createdAt: "2026-11-03T10:00:00.000Z",
    });
    expect(reply.success && reply.data.items).toHaveLength(4);
    expect(load).toHaveBeenCalledWith(
      SHOP,
      expect.objectContaining({
        site: expect.objectContaining({ currentRevisionId: "rev-1" }),
      }),
    );
  });

  it("ревизии ещё нет — revision null и пустой список, документ не читается", async () => {
    const { placements, load } = placementsWith({
      site: { ...SITE, currentRevisionId: null as unknown as string },
    });
    const reply = await placements.list({
      shopId: SHOP,
      extensionId: "test-ext",
    });
    expect(reply).toEqual({
      success: true,
      data: { revision: null, items: [] },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("магазина нет — not_found", async () => {
    const { placements } = placementsWith({ site: null });
    const reply = await placements.list({
      shopId: SHOP,
      extensionId: "test-ext",
    });
    expect(reply).toMatchObject({ success: false, code: "not_found" });
  });

  it("сбой чтения — unavailable с текстом, не исключение", async () => {
    const { placements } = placementsWith({
      load: jest.fn().mockRejectedValue(new Error("база недоступна")),
    });
    const reply = await placements.list({
      shopId: SHOP,
      extensionId: "test-ext",
    });
    expect(reply).toEqual({
      success: false,
      code: "unavailable",
      message: "база недоступна",
    });
  });
});

describe("договор: наборы примеров placements", () => {
  it.each(examples.placements.requests.valid)(
    "запрос годится: %j",
    (request) => {
      expect(PlacementsRequestSchema.safeParse(request).success).toBe(true);
    },
  );
  it.each(examples.placements.requests.invalid)(
    "запрос: $why — не годится",
    ({ request }) => {
      expect(PlacementsRequestSchema.safeParse(request).success).toBe(false);
    },
  );
  it.each(examples.placements.replies.valid)("ответ годится: %j", (reply) => {
    expect(PlacementsReplySchema.safeParse(reply).success).toBe(true);
  });
  it.each(examples.placements.replies.invalid)(
    "ответ: $why — не годится",
    ({ reply }) => {
      expect(PlacementsReplySchema.safeParse(reply).success).toBe(false);
    },
  );
});

describe("ExtensionSectionsController.placementsOf", () => {
  function controllerWith(list: jest.Mock) {
    return new ExtensionSectionsController(
      { call: jest.fn() } as unknown as StorefrontBuilderClient,
      {} as unknown as StorefrontHandoff,
      {} as unknown as ExtensionPlaces,
      { list } as unknown as ExtensionPlacements,
    );
  }

  it("запрос по договору уходит в сервис как есть", async () => {
    const reply = { success: true, data: { revision: null, items: [] } };
    const list = jest.fn().mockResolvedValue(reply);
    const request = {
      shopId: SHOP,
      extensionId: "test-ext",
      section: "gallery",
    };
    await expect(controllerWith(list).placementsOf(request)).resolves.toEqual(
      reply,
    );
    expect(list).toHaveBeenCalledWith(request);
  });

  it("запрос не по договору — unavailable, сервис не зовётся", async () => {
    const list = jest.fn();
    const reply = await controllerWith(list).placementsOf({
      shopId: "shop-1",
      extensionId: "test-ext",
    });
    expect(reply).toMatchObject({ success: false, code: "unavailable" });
    expect(list).not.toHaveBeenCalled();
  });
});
