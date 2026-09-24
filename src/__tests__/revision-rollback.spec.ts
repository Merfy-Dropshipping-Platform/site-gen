/**
 * Откат (этап 2, кусок 2.3, И6): новая ревизия — ТОЧНАЯ копия выбранной
 * версии (как она хранится) со сверкой «текущая = та, что видел клиент»,
 * а не перестановка указателя на старую строку.
 *
 * Решение главного агента (ревью 24.09): откат — осознанное действие, поверх
 * чужой правки его молча не пишем. Текущая сменилась — отказ
 * `revision_conflict` (409), без слияния и без «побеждает последний».
 * Открытая вкладка конструктора после отката сохраняет дальше: её запись
 * сливается поверх отката.
 */
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";
const CONFLICT = {
  success: false,
  code: "REVISION_CONFLICT",
  message: "revision_conflict",
};

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
  const rollback = (revisionId: string, extra: Doc = {}): Promise<any> =>
    rpc.setCurrentRevision({
      tenantId: TENANT,
      siteId: SITE,
      revisionId,
      ...extra,
    });
  /** Правка героя после r0 — чтобы было что откатывать. */
  const editAfterR0 = async () => {
    const doc = clone(await read());
    hero(doc).props.heading = {
      ...hero(doc).props.heading,
      text: "Правка после r0",
    };
    return (await autosave(doc, "r0")).currentRevisionId as string;
  };
  return { fake, sites, read, autosave, rollback, editAfterR0 };
}

describe("откат — точная копия со сверкой, а не перестановка указателя (И6)", () => {
  it("копия r0 как она хранится (весь документ, состав pagesData), пометка restoredFrom, r0 не становится текущей", async () => {
    const { fake, rollback, editAfterR0 } = await setup();
    const r1 = await editAfterR0();

    const res = await rollback("r0");

    expect(res).toMatchObject({ success: true, restoredFrom: "r0" });
    const copy = fake.site.currentRevisionId!;
    expect(copy).toBe(res.revisionId);
    expect(copy).not.toBe("r0");
    expect(fake.storedData(copy)).toEqual(fake.storedData("r0"));
    expect(Object.keys(fake.storedData(copy).pagesData)).toEqual(
      Object.keys(fake.storedData("r0").pagesData),
    );
    expect(fake.storedMeta(copy)).toMatchObject({
      actor: "merchant",
      source: "rollback",
      base: r1,
      restoredFrom: "r0",
    });
    expect(fake.storedMeta(copy).changes).toContain(
      "page:home/block:Hero-1/props/heading/text",
    );
    expect(fake.inPlaceUpdates).toEqual([]);
  });

  it("откат на ревизию, которая и так текущая, — ничего не пишет и возвращает её id", async () => {
    const { fake, rollback, editAfterR0 } = await setup();
    const r1 = await editAfterR0();
    const count = fake.revisions.size;

    const res = await rollback(r1);

    expect(res).toEqual({ success: true, revisionId: r1, restoredFrom: r1 });
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe(r1);
  });

  it("клиент видел не ту текущую — 409, без слияния, ничего не записано", async () => {
    const { fake, rollback, editAfterR0 } = await setup();
    const r1 = await editAfterR0();
    const count = fake.revisions.size;

    const res = await rollback("r0", { expectedCurrentRevisionId: "r0" });

    expect(res).toEqual(CONFLICT);
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe(r1);
  });

  it("явный null («ревизии нет») не теряется: у магазина есть текущая — 409", async () => {
    const { fake, rollback, editAfterR0 } = await setup();
    const r1 = await editAfterR0();

    const res = await rollback("r0", { expectedCurrentRevisionId: null });

    expect(res).toEqual(CONFLICT);
    expect(fake.site.currentRevisionId).toBe(r1);
  });

  it("откат на ревизию другого магазина — revision_not_found, ничего не записано", async () => {
    const { fake, rollback } = await setup();
    fake.seedRevision("r-foreign", clone(fake.storedData("r0")), {
      siteId: "site-foreign",
    });
    const count = fake.revisions.size;

    await expect(rollback("r-foreign")).resolves.toMatchObject({
      success: false,
      message: "revision_not_found",
    });
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe("r0");
  });
});

describe("откат и автосейв", () => {
  it("автосейв влетел между чтением и записью отката — 409, в базе ничего нового, правка автосейва на месте", async () => {
    const { fake, read, rollback, editAfterR0 } = await setup();
    const r1 = await editAfterR0();
    fake.hooks.beforeCas = () => {
      const raw = clone(fake.storedData(r1));
      raw.pagesData.home.content.find(
        (b: Doc) => b.type === "MainText",
      ).props.testField = "влетело";
      fake.seedRevision("r-autosave", raw);
    };
    const count = fake.revisions.size;

    const res = await rollback("r0");

    expect(res).toEqual(CONFLICT);
    expect(fake.revisions.size).toBe(count + 1); // только сам автосейв
    expect(fake.site.currentRevisionId).toBe("r-autosave");
    expect(blockOf(await read(), "MainText").props.testField).toBe("влетело");
  });

  it("автосейв вкладки после отката сливается поверх: её правка сверху, остальное откачено", async () => {
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
});
