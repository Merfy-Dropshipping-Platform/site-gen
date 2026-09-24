/**
 * Запись с базой и слиянием (этап 2, кусок 2.2): `StoreContent.save` с `base`.
 *
 *  - база совпадает с текущей → обычная запись с CAS (И7: для одного писателя
 *    поведение не меняется, данные те же, в `meta` добавляются метки);
 *  - база устарела → `merge3(база, текущая, входящая)` вместо 409 (И2);
 *  - «линия клиента» (И4): при слиянии входящий документ клиента
 *    сохраняется нетекущей ревизией-снимком, его id — база следующего
 *    сохранения этого клиента (`effect.clientVersion`). Тогда чужая правка
 *    переживает любое число сохранений устаревшей вкладки.
 *
 * Документы — настоящие: свежий магазин bloom (`buildInitialRevision`), чтение
 * через тот же `load()`, что у конструктора (27 миграций, досев, адреса).
 */
import { DocumentAdapter } from "../document.adapter";
import { SitesDomainService } from "../../sites.service";
import { RevisionMergeConflictError } from "../store-content.port";
import type { SaveParams } from "../store-content.port";
import { makeFakeRevisionDb } from "./fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";
const HERO_TEXT = "page:home/block:Hero-1/props/heading/text";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function makeBareService(): any {
  const dep = {} as any;
  return new SitesDomainService(dep, dep, dep, dep, dep, dep, dep, dep, dep);
}

function homeBlock(doc: Doc, id: string): Doc {
  return doc.pagesData.home.content.find((b: Doc) => b.props?.id === id);
}

function setProp(doc: Doc, blockId: string, key: string, value: unknown): Doc {
  const next = clone(doc);
  homeBlock(next, blockId).props[key] = value;
  return next;
}

function setHeading(doc: Doc, text: string): Doc {
  const next = clone(doc);
  homeBlock(next, "Hero-1").props.heading = {
    ...homeBlock(next, "Hero-1").props.heading,
    text,
  };
  return next;
}

async function freshStore(themeId = "bloom") {
  const fake = makeFakeRevisionDb({ id: SITE, tenantId: TENANT, themeId });
  const initial = await makeBareService().buildInitialRevision(themeId);
  fake.seedRevision("r0", initial);
  const adapter = new DocumentAdapter(fake.db);
  const site = () => ({
    themeId,
    publicUrl: null,
    name: "Витрина",
    contentModel: "document",
    currentRevisionId: fake.site.currentRevisionId,
  });
  const load = (revisionId?: string) =>
    adapter.load(SITE, { revisionId, site: site() });
  const save = (
    document: Doc,
    base: string | null,
    extra: Partial<SaveParams> = {},
  ) =>
    adapter.save(SITE, {
      document,
      base,
      tenantId: TENANT,
      setCurrent: true,
      filterSeeded: true,
      actor: "merchant",
      source: "constructor",
      mergePolicy: "last-writer-wins",
      site: site(),
      ...extra,
    });
  return { fake, adapter, load, save, site };
}

describe("save с базой: база совпадает с текущей (один писатель, И7)", () => {
  it("данные записи те же, что без базы; метки кто/откуда/база/что — в meta", async () => {
    const a = await freshStore();
    const b = await freshStore();
    const doc = setHeading((await a.load()).document, "Новый заголовок");

    const withBase = await a.save(doc, "r0", { meta: { title: "автосейв" } });
    const legacy = await b.adapter.save(SITE, {
      document: doc,
      tenantId: TENANT,
      setCurrent: true,
      expectedVersion: "r0",
      filterSeeded: true,
      meta: { title: "автосейв" },
      site: b.site(),
    });

    expect(a.fake.storedData(withBase.version)).toEqual(
      b.fake.storedData(legacy.version),
    );
    expect(a.fake.site.currentRevisionId).toBe(withBase.version);
    expect(a.fake.revisions.size).toBe(2);
    expect(withBase.effect).toEqual({
      merged: false,
      clientVersion: withBase.version,
      overwritten: [],
      conflicts: [],
      changes: [HERO_TEXT],
    });
    expect(a.fake.storedMeta(withBase.version)).toEqual({
      title: "автосейв",
      actor: "merchant",
      source: "constructor",
      base: "r0",
      changes: [HERO_TEXT],
    });
  });

  it("запись без base и без меток (создание магазина, смена темы) — meta ровно как передали", async () => {
    const { fake, adapter, site, load } = await freshStore();
    const doc = (await load()).document;
    const saved = await adapter.save(SITE, {
      document: doc,
      tenantId: TENANT,
      setCurrent: true,
      meta: { title: "Theme reseed" },
      site: site(),
    });
    expect(fake.storedMeta(saved.version)).toEqual({ title: "Theme reseed" });
    expect(saved.effect).toBeUndefined();
  });
});

describe("save с базой: устаревшая база сливается (И2)", () => {
  it("две вкладки: правки в разных секциях — обе на месте, без 409", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    const tabB = await load();

    const savedB = await save(
      setHeading(tabB.document, "Заголовок B"),
      tabB.version,
    );
    expect(savedB.effect?.merged).toBe(false);

    const docA = setProp(tabA.document, "Gallery-1", "testField", "правка A");
    const savedA = await save(docA, tabA.version);

    expect(savedA.effect?.merged).toBe(true);
    expect(savedA.effect?.overwritten).toEqual([]);
    expect(fake.site.currentRevisionId).toBe(savedA.version);
    const now = (await load()).document;
    expect(homeBlock(now, "Hero-1").props.heading.text).toBe("Заголовок B");
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("правка A");

    const meta = fake.storedMeta(savedA.version);
    expect(meta).toMatchObject({
      actor: "merchant",
      source: "constructor",
      base: tabA.version,
      changes: ["page:home/block:Gallery-1/props/testField"],
      merge: {
        onto: savedB.version,
        clientVersion: savedA.effect?.clientVersion,
        overwritten: [],
      },
    });
  });

  it("линия клиента: снимок документа вкладки — нетекущая ревизия с meta.kind=client-snapshot", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    await save(setHeading((await load()).document, "B"), "r0");
    const docA = setProp(tabA.document, "Gallery-1", "testField", "A");
    const savedA = await save(docA, "r0");

    const snapshot = savedA.effect!.clientVersion;
    expect(snapshot).not.toBe(savedA.version);
    expect(fake.site.currentRevisionId).toBe(savedA.version);
    expect(fake.storedMeta(snapshot)).toMatchObject({
      kind: "client-snapshot",
      actor: "merchant",
      source: "constructor",
      base: "r0",
      snapshotOf: savedA.version,
    });
    const snapDoc = fake.storedData(snapshot);
    expect(homeBlock(snapDoc, "Hero-1").props.heading.text).not.toBe("B");
    expect(homeBlock(snapDoc, "Gallery-1").props.testField).toBe("A");
  });

  it("И4: чужая правка переживает ДВА подряд сохранения устаревшей вкладки (база — clientVersion)", async () => {
    const { load, save } = await freshStore();
    const tabA = await load();
    await save(setHeading((await load()).document, "Чужой заголовок"), "r0");

    let docA = setProp(tabA.document, "Gallery-1", "testField", "A1");
    let baseA = (await save(docA, tabA.version)).effect!.clientVersion;

    docA = setProp(docA, "MainText-1", "testField", "A2");
    baseA = (await save(docA, baseA)).effect!.clientVersion;

    docA = setProp(docA, "MultiColumns-1", "testField", "A3");
    await save(docA, baseA);

    const now = (await load()).document;
    expect(homeBlock(now, "Hero-1").props.heading.text).toBe("Чужой заголовок");
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("A1");
    expect(homeBlock(now, "MainText-1").props.testField).toBe("A2");
    expect(homeBlock(now, "MultiColumns-1").props.testField).toBe("A3");
  });

  it("контракт: если взять базой слитую ревизию, не подтянув её документ, — сервер поверит базе и чужая правка откатится", async () => {
    const { load, save } = await freshStore();
    const original = homeBlock((await load()).document, "Hero-1").props.heading
      .text;
    const tabA = await load();
    await save(setHeading((await load()).document, "Чужой заголовок"), "r0");
    const docA = setProp(tabA.document, "Gallery-1", "testField", "A1");
    const merged = await save(docA, tabA.version);

    await save(setProp(docA, "MainText-1", "testField", "A2"), merged.version);

    const now = (await load()).document;
    expect(homeBlock(now, "Hero-1").props.heading.text).toBe(original);
  });

  it("одно и то же поле, last-writer-wins: побеждает входящее, чужое — в overwritten и в meta", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    await save(setHeading((await load()).document, "Чужое"), "r0");

    const savedA = await save(setHeading(tabA.document, "Моё"), tabA.version);
    expect(savedA.effect?.overwritten).toEqual([
      { path: HERO_TEXT, current: "Чужое", incoming: "Моё" },
    ]);
    expect(
      homeBlock((await load()).document, "Hero-1").props.heading.text,
    ).toBe("Моё");
    expect(fake.storedMeta(savedA.version).merge.overwritten).toEqual([
      { path: HERO_TEXT, current: "Чужое", incoming: "Моё" },
    ]);
  });

  it("одно и то же поле, reject-conflicts: ошибка со списком, ничего не записано", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    const afterB = await save(
      setHeading((await load()).document, "Чужое"),
      "r0",
    );
    const count = fake.revisions.size;

    const attempt = save(setHeading(tabA.document, "Моё"), tabA.version, {
      mergePolicy: "reject-conflicts",
    });
    await expect(attempt).rejects.toBeInstanceOf(RevisionMergeConflictError);
    await expect(attempt).rejects.toMatchObject({
      message: "revision_merge_conflict",
      conflicts: [{ path: HERO_TEXT, current: "Чужое", incoming: "Моё" }],
    });
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe(afterB.version);
  });

  it("гонка: чужая запись пришла прямо перед CAS — повтор сливает поверх неё", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    fake.hooks.beforeCas = () => {
      const raw = clone(fake.storedData("r0"));
      const hero = raw.pagesData.home.content.find(
        (b: Doc) => b.props?.id === "Hero-1",
      );
      hero.props.heading = { ...hero.props.heading, text: "Влетело перед CAS" };
      fake.seedRevision("r-race", raw);
    };

    const savedA = await save(
      setProp(tabA.document, "Gallery-1", "testField", "A"),
      tabA.version,
    );

    expect(savedA.effect?.merged).toBe(true);
    expect(savedA.effect?.overwritten).toEqual([]);
    const now = (await load()).document;
    expect(homeBlock(now, "Hero-1").props.heading.text).toBe(
      "Влетело перед CAS",
    );
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("A");
  });

  it("слитая ревизия не вмораживает досеянные страницы: состав pagesData как у обычной записи", async () => {
    const { fake, load, save } = await freshStore();
    const tabA = await load();
    const savedB = await save(setHeading((await load()).document, "B"), "r0");
    const savedA = await save(
      setProp(tabA.document, "Gallery-1", "testField", "A"),
      tabA.version,
    );

    const keys = (id: string) =>
      Object.keys(fake.storedData(id).pagesData).sort();
    expect(keys(savedA.version)).toEqual(keys(savedB.version));
  });

  it("запись операциями от базы вместо документа", async () => {
    const { load, save } = await freshStore();
    await save(
      setProp((await load()).document, "Gallery-1", "testField", "чужое"),
      "r0",
    );

    const saved = await save(undefined as unknown as Doc, "r0", {
      document: undefined,
      ops: [{ op: "set", path: HERO_TEXT, value: "операцией" }],
    });

    expect(saved.effect?.merged).toBe(true);
    const now = (await load()).document;
    expect(homeBlock(now, "Hero-1").props.heading.text).toBe("операцией");
    expect(homeBlock(now, "Gallery-1").props.testField).toBe("чужое");
  });

  it("база, которой нет у этого магазина, — явная ошибка, а не запись вслепую", async () => {
    const { fake, load, save } = await freshStore();
    await save(setHeading((await load()).document, "B"), "r0");
    const count = fake.revisions.size;
    await expect(
      save((await load()).document, "rev-of-another-site"),
    ).rejects.toThrow("base_revision_not_found");
    expect(fake.revisions.size).toBe(count);
  });
});
