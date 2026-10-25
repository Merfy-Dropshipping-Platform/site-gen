import { SitesMicroserviceController } from "../../sites.microservice.controller";
import { SitesDomainService } from "../../sites.service";
import { DocumentAdapter } from "../document.adapter";
import {
  RoleDuplicateError,
  assertRoleInstances,
  placedShopSections,
  roleDuplicates,
} from "../section-roles";
import type { SaveOnBaseParams } from "../store-content.port";
import { makeFakeRevisionDb } from "./fake-revision-db";

// Один экземпляр секции с ролью (блок 12 «Секций и SDK», 12.1, «Решил сам» п. 5; часть 12а): второй экземпляр той же
// роли в ключе sections — ошибка записи role-duplicate, ничего не записано; ответ RPC — как у section-id-duplicate.
type Doc = Record<string, any>;
const SITE = "site-1";
const TENANT = "tenant-1";
const drawer = (id: string) => ({
  id,
  section: "shop:cart-drawer",
  settings: {},
});
const ROLES = new Map([
  ["shop:cart-drawer", "cart-drawer"],
  ["shop:cart", "cart"],
]);

describe("экземпляры секций с ролью", () => {
  it("второй экземпляр той же роли — повтор со всеми местами; по одному на роль — повторов нет", () => {
    const document = {
      sections: {
        overlay: [drawer("drawer-1"), drawer("drawer-2")],
        "page-cart": [{ id: "cart-1", section: "shop:cart", settings: {} }],
        home: [{ id: "hero-1", section: "shop:hero", settings: {} }],
      },
    };
    expect(roleDuplicates(document, ROLES)).toEqual([
      { role: "cart-drawer", ids: ["overlay/drawer-1", "overlay/drawer-2"] },
    ]);
    expect(placedShopSections(document)).toEqual([
      "shop:cart-drawer",
      "shop:cart",
      "shop:hero",
    ]);
  });

  it("та же роль в разных списках — повтор; списки имён нынешних тем и не объект — повторов нет", () => {
    const spread = {
      sections: { overlay: [drawer("drawer-1")], footer: [drawer("drawer-2")] },
    };
    expect(roleDuplicates(spread, ROLES)).toEqual([
      { role: "cart-drawer", ids: ["overlay/drawer-1", "footer/drawer-2"] },
    ]);
    expect(
      roleDuplicates(
        { sections: { home: ["shop:cart-drawer", "shop:cart-drawer"] } },
        ROLES,
      ),
    ).toEqual([]);
    expect(roleDuplicates(null, ROLES)).toEqual([]);
    expect(placedShopSections({ sections: { home: ["shop:hero"] } })).toEqual(
      [],
    );
  });

  it("секций магазина нет — роли не читаются; есть — одно чтение на все документы", async () => {
    const read = jest.fn(async () => ROLES);
    await assertRoleInstances(read, SITE, [
      { sections: { home: [] } },
      { tokens: {} },
    ]);
    expect(read).not.toHaveBeenCalled();
    const twice = {
      sections: { overlay: [drawer("drawer-1"), drawer("drawer-2")] },
    };
    await expect(
      assertRoleInstances(read, SITE, [{ sections: {} }, twice]),
    ).rejects.toBeInstanceOf(RoleDuplicateError);
    expect(read.mock.calls).toEqual([[SITE, ["shop:cart-drawer"]]]);
  });
});

describe("запись ревизии через адаптер", () => {
  function makeBareService(): any {
    const dep = {} as any;
    return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
  }

  async function store() {
    const fake = makeFakeRevisionDb({
      id: SITE,
      tenantId: TENANT,
      themeId: "bloom",
    });
    fake.seedRevision("r0", {
      ...(await makeBareService().buildInitialRevision("bloom")),
      sections: {},
    });
    fake.seedSectionRole("shop:cart-drawer", "cart-drawer");
    fake.seedSectionRole("shop:hero", null);
    const adapter = new DocumentAdapter(fake.db, async () => ({}));
    const site = () => ({
      themeId: "bloom",
      publicUrl: null,
      name: "Витрина",
      contentModel: "document",
      currentRevisionId: fake.site.currentRevisionId,
    });
    const doc = (await adapter.load(SITE, { site: site() })).document as Doc;
    const save = (sections: Doc) =>
      adapter.save(SITE, {
        mode: "on-base",
        document: { ...doc, sections },
        base: "r0",
        tenantId: TENANT,
        filterSeeded: true,
        actor: "merchant",
        source: "constructor",
        mergePolicy: "last-writer-wins",
        site: site(),
      } as SaveOnBaseParams);
    return { fake, save };
  }

  it("второй экземпляр выезжающей корзины — RoleDuplicateError, ревизия не записана", async () => {
    const { fake, save } = await store();
    const before = fake.revisions.size;
    await expect(
      save({ overlay: [drawer("drawer-1"), drawer("drawer-2")] }),
    ).rejects.toBeInstanceOf(RoleDuplicateError);
    expect([fake.revisions.size, fake.site.currentRevisionId]).toEqual([
      before,
      "r0",
    ]);
  });

  it("по одному экземпляру — записано; секция без роли — сколько угодно", async () => {
    const { fake, save } = await store();
    const hero = (id: string) => ({ id, section: "shop:hero", settings: {} });
    const saved = await save({
      overlay: [drawer("drawer-1")],
      home: [hero("hero-1"), hero("hero-2")],
    });
    expect(fake.storedData(saved.version)?.sections.overlay).toEqual([
      drawer("drawer-1"),
    ]);
  });
});

describe("RPC sites.revisions.create", () => {
  it("код role-duplicate и список повторов", async () => {
    const duplicates = [
      { role: "cart-drawer", ids: ["overlay/drawer-1", "overlay/drawer-2"] },
    ];
    const domain = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new RoleDuplicateError(duplicates)),
    };
    const controller = new SitesMicroserviceController(domain as never);
    await expect(
      controller.createRevision({ tenantId: TENANT, siteId: SITE, data: {} }),
    ).resolves.toEqual({
      success: false,
      code: "role-duplicate",
      message: "role-duplicate",
      duplicates,
    });
  });
});
