/**
 * Все писатели через порт (этап 2, кусок 2.3): страницы кабинета
 * (`PagesService` create/update/delete) и сброс контент-страниц
 * (`resetContentPages`) пишут НОВУЮ ревизию через `StoreContent.save` с
 * базой, а не `UPDATE site_revision SET data` на текущей строке (И1).
 *
 * Главный сценарий плана: страница из кабинета во время автосейва
 * конструктора — обе правки на месте, в любом порядке прихода.
 */
import { PagesService } from "../pages/pages.service";
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function block(doc: Doc, pageId: string, type: string): Doc {
  return doc.pagesData[pageId].content.find((b: Doc) => b.type === type);
}

async function setup(themeId = "bloom") {
  const fake = makeFakeRevisionDb({ id: SITE, tenantId: TENANT, themeId });
  const dep = {} as any;
  const sites = new SitesDomainService(
    fake.db,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  jest
    .spyOn(sites, "get")
    .mockImplementation(async () => ({ ...fake.site }) as never);
  const initial = await (sites as any).buildInitialRevision(themeId);
  fake.seedRevision("r0", initial);
  const pages = new PagesService(fake.db);
  const rpc = new SitesMicroserviceController(sites);
  const open = async () => {
    const id = fake.site.currentRevisionId!;
    return {
      doc: (await sites.getRevision(TENANT, SITE, id)).item.data as Doc,
      revisionId: id,
    };
  };
  const autosave = (
    data: Doc,
    expectedCurrentRevisionId: string,
  ): Promise<any> =>
    rpc.createRevision({
      tenantId: TENANT,
      siteId: SITE,
      data,
      setCurrent: true,
      expectedCurrentRevisionId,
    });
  return { fake, sites, pages, open, autosave, initial };
}

describe("PagesService пишет новую ревизию через порт (И1)", () => {
  it("createPage: новая текущая ревизия, прежняя не тронута, в meta — кто/откуда/база/что", async () => {
    const { fake, pages, initial } = await setup();
    const { page } = await pages.createPage({
      tenantId: TENANT,
      siteId: SITE,
      name: "Акции",
      slug: "/sale",
    });

    const current = fake.site.currentRevisionId!;
    expect(current).not.toBe("r0");
    expect(fake.inPlaceUpdates).toEqual([]);
    expect(fake.storedData("r0")).toEqual(initial);

    const data = fake.storedData(current);
    expect(data.pages.map((p: Doc) => p.id)).toContain(page.id);
    expect(data.pagesData[page.id]).toBeDefined();
    expect(data.lockVersion).toBe((initial.lockVersion ?? 1) + 1);

    const meta = fake.storedMeta(current);
    expect(meta).toMatchObject({
      actor: "merchant",
      source: "admin-pages",
      base: "r0",
    });
    expect(meta.changes).toEqual(
      expect.arrayContaining([`pages/${page.id}`, `page:${page.id}`]),
    );
  });

  it("updatePage и deletePage — тоже новые ревизии, без правки на месте", async () => {
    const { fake, pages } = await setup();
    const { page } = await pages.createPage({
      tenantId: TENANT,
      siteId: SITE,
      name: "Акции",
      slug: "/sale",
    });
    const afterCreate = fake.site.currentRevisionId;

    await pages.updatePage({
      tenantId: TENANT,
      siteId: SITE,
      pageId: page.id,
      name: "Скидки",
      content: "<p>Текст</p>",
    });
    const afterUpdate = fake.site.currentRevisionId;
    expect(afterUpdate).not.toBe(afterCreate);
    const updated = fake.storedData(afterUpdate!);
    expect(updated.pages.find((p: Doc) => p.id === page.id).name).toBe(
      "Скидки",
    );
    expect(block(updated, page.id, "Page").props.content).toBe("<p>Текст</p>");

    await pages.deletePage({ tenantId: TENANT, siteId: SITE, pageId: page.id });
    const afterDelete = fake.site.currentRevisionId;
    expect(afterDelete).not.toBe(afterUpdate);
    expect(
      fake.storedData(afterDelete!).pages.map((p: Doc) => p.id),
    ).not.toContain(page.id);
    expect(fake.storedMeta(afterDelete!)).toMatchObject({
      source: "admin-pages",
      base: afterUpdate,
    });
    expect(fake.inPlaceUpdates).toEqual([]);
  });
});

describe("страница из кабинета во время автосейва — обе правки на месте", () => {
  it("кабинет успел раньше: автосейв со старой базой сливается, новая страница и пункт меню остаются", async () => {
    const { pages, open, autosave } = await setup();
    const tab = await open();

    const { page } = await pages.createPage({
      tenantId: TENANT,
      siteId: SITE,
      name: "Акции",
      slug: "/sale",
    });

    const edited = clone(tab.doc);
    block(edited, "home", "Hero").props.testField = "правка конструктора";
    const saved = await autosave(edited, tab.revisionId);
    expect(saved).toMatchObject({
      success: true,
      merged: true,
      overwritten: [],
    });

    const now = (await open()).doc;
    expect(now.pages.map((p: Doc) => p.id)).toContain(page.id);
    expect(now.pagesData[page.id]).toBeDefined();
    const links = block(now, "home", "Header").props.navigationLinks.map(
      (l: Doc) => l.href,
    );
    expect(links).toContain("/sale");
    expect(block(now, "home", "Hero").props.testField).toBe(
      "правка конструктора",
    );

    // И следующий автосейв той же вкладки (база — revisionId из ответа) страницу не теряет.
    const next = clone(edited);
    block(next, "home", "Gallery").props.testField = "вторая правка";
    await autosave(next, saved.revisionId);
    const later = (await open()).doc;
    expect(later.pages.map((p: Doc) => p.id)).toContain(page.id);
    expect(
      block(later, "home", "Header").props.navigationLinks.map(
        (l: Doc) => l.href,
      ),
    ).toContain("/sale");
    expect(block(later, "home", "Gallery").props.testField).toBe(
      "вторая правка",
    );
  });

  it("автосейв влетел между чтением и записью кабинета: запись кабинета сливается поверх", async () => {
    const { fake, pages, open } = await setup();
    fake.hooks.beforeCas = () => {
      const raw = clone(fake.storedData("r0"));
      raw.pagesData.home.content.find(
        (b: Doc) => b.type === "Hero",
      ).props.testField = "автосейв";
      fake.seedRevision("r-autosave", raw);
    };

    const { page } = await pages.createPage({
      tenantId: TENANT,
      siteId: SITE,
      name: "Акции",
      slug: "/sale",
    });

    const now = (await open()).doc;
    expect(block(now, "home", "Hero").props.testField).toBe("автосейв");
    expect(now.pages.map((p: Doc) => p.id)).toContain(page.id);
    expect(fake.storedMeta(fake.site.currentRevisionId!)).toMatchObject({
      source: "admin-pages",
      merge: { onto: "r-autosave" },
    });
  });

  it("то же место изменили одновременно: кабинет пересчитывает правку от свежей ревизии, чужое не затирает", async () => {
    const { fake, pages, open } = await setup();
    const { page } = await pages.createPage({
      tenantId: TENANT,
      siteId: SITE,
      name: "Акции",
      slug: "/sale",
    });
    const base = fake.site.currentRevisionId!;
    fake.hooks.beforeCas = () => {
      const raw = clone(fake.storedData(base));
      raw.pages.find((p: Doc) => p.id === page.id).name =
        "Имя из другого места";
      raw.pagesData.home.content.find(
        (b: Doc) => b.type === "Hero",
      ).props.testField = "чужая правка";
      fake.seedRevision("r-concurrent", raw);
    };

    await pages.updatePage({
      tenantId: TENANT,
      siteId: SITE,
      pageId: page.id,
      name: "Имя из кабинета",
    });

    const now = (await open()).doc;
    expect(now.pages.find((p: Doc) => p.id === page.id).name).toBe(
      "Имя из кабинета",
    );
    expect(block(now, "home", "Hero").props.testField).toBe("чужая правка");
    expect(fake.storedMeta(fake.site.currentRevisionId!)).toMatchObject({
      base: "r-concurrent",
    });
  });
});

describe("resetContentPages — через порт", () => {
  it("сброс на сиды темы — новая ревизия (кто: system, откуда: ops), текущая строка не правится", async () => {
    const { fake, sites } = await setup("rose");
    const res = await sites.resetContentPages(SITE);

    expect(res.reset.length).toBeGreaterThan(0);
    expect(fake.inPlaceUpdates).toEqual([]);
    const current = fake.site.currentRevisionId!;
    expect(current).not.toBe("r0");
    expect(fake.storedMeta(current)).toMatchObject({
      actor: "system",
      source: "ops",
      base: "r0",
    });
    expect(Object.keys(fake.storedData(current).pagesData)).toEqual(
      expect.arrayContaining(res.reset),
    );
  });
});
