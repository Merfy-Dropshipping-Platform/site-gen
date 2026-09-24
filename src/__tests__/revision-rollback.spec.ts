/**
 * Откат (этап 2, кусок 2.3, И6): новая ревизия-копия выбранной версии с CAS
 * и пометкой «восстановлено из rN», а не безусловная перестановка указателя
 * на старую строку.
 *
 * Откат во время автосейва не теряет правок: откат сливается поверх
 * успевшего автосейва (побеждает последний — откат), а следующий автосейв
 * вкладки сливается поверх отката (правка вкладки — сверху, остальное
 * откатом не отменяется).
 */
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function hero(doc: Doc): Doc {
  return doc.pagesData.home.content.find((b: Doc) => b.type === "Hero");
}

function blockOf(doc: Doc, type: string): Doc {
  return doc.pagesData.home.content.find((b: Doc) => b.type === type);
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
  fake.seedRevision("r0", await (sites as any).buildInitialRevision(themeId));
  const rpc = new SitesMicroserviceController(sites);
  const read = async (revisionId = fake.site.currentRevisionId!) =>
    (await sites.getRevision(TENANT, SITE, revisionId)).item.data as Doc;
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
  const rollback = (revisionId: string): Promise<any> =>
    rpc.setCurrentRevision({ tenantId: TENANT, siteId: SITE, revisionId });
  return { fake, sites, read, autosave, rollback };
}

describe("откат — новая ревизия-копия, а не перестановка указателя (И6)", () => {
  it("копия содержимого r0, пометка restoredFrom, сама r0 не становится текущей", async () => {
    const { fake, read, autosave, rollback } = await setup();
    const doc = clone(await read());
    hero(doc).props.heading = {
      ...hero(doc).props.heading,
      text: "Правка после r0",
    };
    const r1 = (await autosave(doc, "r0")).currentRevisionId;

    const res = await rollback("r0");

    expect(res).toMatchObject({ success: true, restoredFrom: "r0" });
    const current = fake.site.currentRevisionId!;
    expect(current).toBe(res.revisionId);
    expect(current).not.toBe("r0");
    expect(await read(current)).toEqual(await read("r0"));
    expect(fake.storedMeta(current)).toMatchObject({
      actor: "merchant",
      source: "rollback",
      base: r1,
      restoredFrom: "r0",
    });
    expect(fake.storedMeta(current).changes).toContain(
      "page:home/block:Hero-1/props/heading/text",
    );
    expect(fake.inPlaceUpdates).toEqual([]);
  });

  it("откат на ревизию другого магазина — revision_not_found, ничего не записано", async () => {
    const { fake, rollback } = await setup();
    const count = fake.revisions.size;
    await expect(rollback("rev-of-another-site")).resolves.toMatchObject({
      success: false,
      message: "revision_not_found",
    });
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe("r0");
  });
});

describe("откат во время автосейва не теряет правок", () => {
  it("автосейв после отката: правка вкладки встаёт сверху, остальное остаётся откаченным", async () => {
    const { read, autosave, rollback } = await setup();
    const original = hero(await read()).props.heading.text;
    const tab = clone(await read());

    hero(tab).props.heading = {
      ...hero(tab).props.heading,
      text: "Правка вкладки",
    };
    const base = (await autosave(tab, "r0")).revisionId;

    await rollback("r0");

    blockOf(tab, "Gallery").props.testField = "новая правка вкладки";
    await autosave(tab, base);

    const now = await read();
    expect(hero(now).props.heading.text).toBe(original);
    expect(blockOf(now, "Gallery").props.testField).toBe(
      "новая правка вкладки",
    );
  });

  it("автосейв влетел между чтением и записью отката: откат сливается поверх, правка автосейва жива", async () => {
    const { fake, read, autosave, rollback } = await setup();
    const doc = clone(await read());
    hero(doc).props.heading = {
      ...hero(doc).props.heading,
      text: "Правка после r0",
    };
    const r1 = (await autosave(doc, "r0")).currentRevisionId;

    fake.hooks.beforeCas = () => {
      const raw = clone(fake.storedData(r1));
      raw.pagesData.home.content.find(
        (b: Doc) => b.type === "MainText",
      ).props.testField = "влетело";
      fake.seedRevision("r-autosave", raw);
    };
    const res = await rollback("r0");

    expect(res).toMatchObject({ success: true, merged: true });
    const now = await read();
    expect(blockOf(now, "MainText").props.testField).toBe("влетело");
    expect(hero(now).props.heading.text).toBe(
      hero(await read("r0")).props.heading.text,
    );
    expect(fake.storedMeta(fake.site.currentRevisionId!)).toMatchObject({
      source: "rollback",
      restoredFrom: "r0",
      merge: { onto: "r-autosave" },
    });
  });
});
