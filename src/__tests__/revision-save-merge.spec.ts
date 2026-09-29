/**
 * Контракт записи для конструктора (этап 2, кусок 2.2) — через настоящий
 * RPC `sites.revisions.create` и `SitesDomainService.createRevision`.
 *
 * Было: `expectedCurrentRevisionId` устарел → 409 `REVISION_CONFLICT` →
 * очередь конструктора замерзает до перезагрузки.
 * Стало: `expectedCurrentRevisionId` — база записи; устарела → слияние
 * (побеждает последний), ответ `{ success, revisionId, currentRevisionId,
 * merged, overwritten, conflicts }`. `revisionId` — ревизия, равная документу
 * клиента: сегодняшний конструктор берёт его базой следующего сохранения и
 * тем самым уже идёт по своей «линии» — чужая правка не откатывается (И4)
 * даже до куска 2.4.
 */
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { RevisionMergeConflictError } from "../content/store-content.port";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function homeBlock(doc: Doc, id: string): Doc {
  return doc.pagesData.home.content.find((b: Doc) => b.props?.id === id);
}

function withProp(doc: Doc, blockId: string, key: string, value: unknown): Doc {
  const next = clone(doc);
  homeBlock(next, blockId).props[key] = value;
  return next;
}

async function setup(themeId = "bloom") {
  const fake = makeFakeRevisionDb({ id: SITE, tenantId: TENANT, themeId });
  const dep = {} as any;
  const service = new SitesDomainService(
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
    .spyOn(service, "get")
    .mockImplementation(async () => ({ ...fake.site }) as never);
  fake.seedRevision("r0", await (service as any).buildInitialRevision(themeId));
  const controller = new SitesMicroserviceController(service);
  const open = async () => {
    const id = fake.site.currentRevisionId!;
    return {
      doc: (await service.getRevision(TENANT, SITE, id)).item.data as Doc,
      revisionId: id,
    };
  };
  const create = (
    data: Doc,
    expectedCurrentRevisionId?: string | null,
  ): Promise<any> =>
    controller.createRevision({
      tenantId: TENANT,
      siteId: SITE,
      data,
      setCurrent: true,
      actorUserId: "user-1",
      ...(expectedCurrentRevisionId !== undefined
        ? { expectedCurrentRevisionId }
        : {}),
    });
  return { fake, service, controller, open, create };
}

describe("sites.revisions.create: устаревшая база сливается вместо 409", () => {
  it("две вкладки: вторая получает слияние, а не REVISION_CONFLICT", async () => {
    const { fake, open, create } = await setup();
    const tabA = await open();
    const tabB = await open();

    const b = await create(
      withProp(tabB.doc, "Hero-1", "testField", "B"),
      tabB.revisionId,
    );
    expect(b).toMatchObject({ success: true, merged: false });
    expect(b.revisionId).toBe(b.currentRevisionId);

    const a = await create(
      withProp(tabA.doc, "Gallery-1", "testField", "A"),
      tabA.revisionId,
    );
    expect(a).toMatchObject({
      success: true,
      merged: true,
      overwritten: [],
      conflicts: [],
    });
    expect(a.currentRevisionId).toBe(fake.site.currentRevisionId);
    expect(a.revisionId).not.toBe(a.currentRevisionId);

    const now = (await open()).doc;
    expect(homeBlock(now, "Hero-1").props.testField).toBe("B");
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("A");
  });

  it("сегодняшний конструктор (берёт revisionId базой, слитое не подтягивает): чужая правка переживает два его сохранения", async () => {
    const { open, create } = await setup();
    const tab = await open();
    await create(
      withProp((await open()).doc, "Hero-1", "testField", "чужое"),
      (await open()).revisionId,
    );

    let doc = withProp(tab.doc, "Gallery-1", "testField", "A1");
    let expected = (await create(doc, tab.revisionId)).revisionId;
    doc = withProp(doc, "MainText-1", "testField", "A2");
    expected = (await create(doc, expected)).revisionId;
    doc = withProp(doc, "MultiColumns-1", "testField", "A3");
    await create(doc, expected);

    const now = (await open()).doc;
    expect(homeBlock(now, "Hero-1").props.testField).toBe("чужое");
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("A1");
    expect(homeBlock(now, "MainText-1").props.testField).toBe("A2");
    expect(homeBlock(now, "MultiColumns-1").props.testField).toBe("A3");
  });

  it("одно и то же поле: побеждает последний, перезаписанное чужое — в ответе", async () => {
    const { open, create } = await setup();
    const tab = await open();
    await create(
      withProp((await open()).doc, "Hero-1", "testField", "чужое"),
      (await open()).revisionId,
    );

    const res = await create(
      withProp(tab.doc, "Hero-1", "testField", "моё"),
      tab.revisionId,
    );
    expect(res).toMatchObject({
      success: true,
      merged: true,
      overwritten: [
        {
          path: "page:home/block:Hero-1/props/testField",
          current: "чужое",
          incoming: "моё",
        },
      ],
    });
    expect(homeBlock((await open()).doc, "Hero-1").props.testField).toBe("моё");
  });

  it("meta ревизии конструктора: кто, откуда, база, что поменялось", async () => {
    const { fake, open, create } = await setup();
    const tab = await open();
    const res = await create(
      withProp(tab.doc, "Hero-1", "testField", "x"),
      tab.revisionId,
    );
    expect(fake.storedMeta(res.currentRevisionId)).toEqual({
      actor: "merchant",
      source: "constructor",
      base: tab.revisionId,
      changes: ["page:home/block:Hero-1/props/testField"],
    });
    expect(fake.revisions.get(res.currentRevisionId)?.createdBy).toBe("user-1");
  });

  it("без expectedCurrentRevisionId — прежняя запись без базы, но с метками", async () => {
    const { fake, open, create } = await setup();
    const res = await create((await open()).doc);
    expect(res).toEqual({
      success: true,
      revisionId: fake.site.currentRevisionId,
    });
    expect(fake.storedMeta(res.revisionId)).toEqual({
      actor: "merchant",
      source: "constructor",
    });
  });
});

describe("история ревизий не показывает снимки клиента", () => {
  it("listRevisions: слитая ревизия есть, снимок — нет", async () => {
    const { fake, service, open, create } = await setup();
    const tab = await open();
    await create(
      withProp((await open()).doc, "Hero-1", "testField", "B"),
      (await open()).revisionId,
    );
    const a = await create(
      withProp(tab.doc, "Gallery-1", "testField", "A"),
      tab.revisionId,
    );

    const listed = (await service.listRevisions(TENANT, SITE)).items.map(
      (r: { id: string }) => r.id,
    );
    expect(fake.revisions.has(a.revisionId)).toBe(true);
    expect(listed).toContain(a.currentRevisionId);
    expect(listed).not.toContain(a.revisionId);
  });
});

describe("sites.revisions.create: конфликт слияния при строгой политике", () => {
  it("RevisionMergeConflictError → устойчивый конверт со списком мест", async () => {
    const conflicts = [
      { path: "page:home/block:Hero-1/props/x", current: "a", incoming: "b" },
    ];
    const domain = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new RevisionMergeConflictError(conflicts)),
    };
    const controller = new SitesMicroserviceController(
      domain as unknown as SitesDomainService,
    );
    await expect(
      controller.createRevision({ tenantId: TENANT, siteId: SITE, data: {} }),
    ).resolves.toEqual({
      success: false,
      code: "REVISION_MERGE_CONFLICT",
      message: "revision_merge_conflict",
      conflicts,
    });
  });
});
