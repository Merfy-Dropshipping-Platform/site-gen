/**
 * Запись агента в черновик nova (этап 3 «Запись Визи в черновик nova», К1–К3) —
 * через настоящие RPC `sites.revisions.create` / `sites.revisions.set_current`
 * и фейковую БД ревизий (`fake-revision-db.ts`):
 *
 *  К1 — автор: `writer` → `meta.actor/source`, история отдаёт автора;
 *  К2 — политика `keep-current` для агента: значение мерчанта остаётся,
 *       «ничего не легло» ревизии не пишет;
 *  К3 — ключ от повторов: повтор отдаёт сохранённый ответ, дубль ловится
 *       уникальным индексом, ключ другого магазина не пересекается.
 */
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const hero = (id: string, settings: Doc = {}): Doc => ({
  id,
  section: "hero",
  settings,
});

const homeOf = (doc: Doc, id: string): Doc =>
  doc.sections.home.find((s: Doc) => s.id === id);

/** Правка поля секции главной: новый документ, исходный не меняется. */
function withSetting(doc: Doc, id: string, key: string, value: unknown): Doc {
  const next = clone(doc);
  homeOf(next, id).settings[key] = value;
  return next;
}

function withoutSection(doc: Doc, id: string): Doc {
  const next = clone(doc);
  next.sections.home = next.sections.home.filter((s: Doc) => s.id !== id);
  return next;
}

async function setup() {
  const fake = makeFakeRevisionDb({
    id: SITE,
    tenantId: TENANT,
    themeId: "nova",
  });
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
  const starter = await service.buildInitialRevision("nova");
  fake.seedRevision("r0", {
    ...starter,
    sections: {
      home: [
        hero("hero-x", { heading: "Было", text: "Текст" }),
        hero("hero-y", { heading: "Соседняя" }),
      ],
    },
  });
  const controller = new SitesMicroserviceController(service);
  const read = async (id = fake.site.currentRevisionId!) =>
    (await service.getRevision(TENANT, SITE, id)).item.data as Doc;
  const write = (data: Doc, base: string, extra: Doc = {}): Promise<any> =>
    controller.createRevision({
      tenantId: TENANT,
      siteId: SITE,
      data,
      setCurrent: true,
      actorUserId: "user-1",
      expectedCurrentRevisionId: base,
      ...extra,
    });
  return { fake, service, controller, read, write };
}

describe("К1: автор записи", () => {
  it("без writer — как сегодня: merchant/constructor", async () => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const res = await write(withSetting(base, "hero-x", "text", "А"), "r0");
    expect(res.success).toBe(true);
    expect(fake.storedMeta(res.currentRevisionId)).toMatchObject({
      actor: "merchant",
      source: "constructor",
    });
  });

  it.each([
    ["merchant", "merchant", "constructor"],
    ["agent", "agent", "mcp"],
    ["vizi", "agent", "vizi"],
  ])("writer %s → meta.actor=%s, source=%s", async (writer, actor, source) => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const res = await write(withSetting(base, "hero-x", "text", "А"), "r0", {
      writer,
    });
    expect(res.success).toBe(true);
    expect(fake.storedMeta(res.currentRevisionId)).toMatchObject({
      actor,
      source,
    });
  });

  it("история отдаёт автора записи Визи", async () => {
    const { service, read, write } = await setup();
    const base = await read("r0");
    await write(withSetting(base, "hero-x", "text", "А"), "r0", {
      writer: "vizi",
    });
    const { items } = await service.listRevisions(TENANT, SITE);
    expect(items[0]).toMatchObject({ actor: "agent", source: "vizi" });
  });

  it("автора из тела и meta клиента сервис не читает", async () => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const res = await write(withSetting(base, "hero-x", "text", "А"), "r0", {
      actor: "agent",
      source: "vizi",
      meta: { actor: "agent", source: "vizi" },
    });
    expect(fake.storedMeta(res.currentRevisionId)).toMatchObject({
      actor: "merchant",
      source: "constructor",
    });
  });

  it("неизвестный writer — отказ, ревизия не пишется", async () => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const res = await write(withSetting(base, "hero-x", "text", "А"), "r0", {
      writer: "root",
    });
    expect(res).toMatchObject({ success: false, message: "invalid_writer" });
    expect(fake.revisions.size).toBe(1);
  });

  it("откат: writer vizi ставит метки агента, мерчант — merchant/rollback", async () => {
    const { fake, controller, read, write } = await setup();
    const base = await read("r0");
    const edited = await write(withSetting(base, "hero-x", "text", "А"), "r0");
    const asVizi: any = await controller.setCurrentRevision({
      tenantId: TENANT,
      siteId: SITE,
      revisionId: "r0",
      expectedCurrentRevisionId: edited.currentRevisionId,
      writer: "vizi",
    });
    expect(fake.storedMeta(asVizi.revisionId)).toMatchObject({
      actor: "agent",
      source: "vizi",
      restoredFrom: "r0",
    });
    const asMerchant: any = await controller.setCurrentRevision({
      tenantId: TENANT,
      siteId: SITE,
      revisionId: edited.currentRevisionId,
      expectedCurrentRevisionId: asVizi.revisionId,
    });
    expect(fake.storedMeta(asMerchant.revisionId)).toMatchObject({
      actor: "merchant",
      source: "rollback",
    });
  });
});

describe("К2: политика слияния по автору", () => {
  /** Мерчант успел записать `merchantEdit` от r0; дальше пишет Визи от того же r0. */
  async function afterMerchant(merchantEdit: (doc: Doc) => Doc) {
    const s = await setup();
    const base = await s.read("r0");
    const merchant = await s.write(merchantEdit(base), "r0");
    expect(merchant.success).toBe(true);
    return { ...s, base, merchantHead: merchant.currentRevisionId as string };
  }

  it("одно поле: остаётся значение мерчанта, место в conflicts, overwritten пуст", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Мерчант"),
    );
    const edit = withSetting(
      withSetting(s.base, "hero-x", "heading", "Визи"),
      "hero-x",
      "text",
      "Визи текст",
    );
    const res = await s.write(edit, "r0", { writer: "vizi" });

    expect(res).toMatchObject({ success: true, merged: true, overwritten: [] });
    expect(res.conflicts).toEqual([
      {
        path: "sections/home/hero-x/settings/heading",
        current: "Мерчант",
        incoming: "Визи",
      },
    ]);
    const now = await s.read();
    expect(homeOf(now, "hero-x").settings).toMatchObject({
      heading: "Мерчант",
      text: "Визи текст",
    });
    expect(res.checkScope.sections).toEqual([{ page: "home", id: "hero-x" }]);
  });

  it("те же две записи у мерчанта — по-прежнему побеждает последний", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Первый"),
    );
    const res = await s.write(
      withSetting(s.base, "hero-x", "heading", "Второй"),
      "r0",
    );
    expect(res).toMatchObject({ success: true, merged: true, conflicts: [] });
    expect(res.overwritten).toHaveLength(1);
    expect(homeOf(await s.read(), "hero-x").settings.heading).toBe("Второй");
  });

  it("агент без Визи (writer agent) — та же политика keep-current", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Мерчант"),
    );
    const res = await s.write(
      withSetting(
        withSetting(s.base, "hero-x", "heading", "Агент"),
        "hero-y",
        "heading",
        "Агент 2",
      ),
      "r0",
      { writer: "agent" },
    );
    expect(res.conflicts).toHaveLength(1);
    expect(res.overwritten).toEqual([]);
    expect(homeOf(await s.read(), "hero-x").settings.heading).toBe("Мерчант");
  });

  it("мерчант удалил секцию, Визи её правил: секция не вернулась", async () => {
    const s = await afterMerchant((d) => withoutSection(d, "hero-x"));
    const edit = withSetting(
      withSetting(s.base, "hero-x", "heading", "Визи"),
      "hero-y",
      "heading",
      "Визи соседняя",
    );
    const res = await s.write(edit, "r0", { writer: "vizi" });
    expect(res.success).toBe(true);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].current).toBeNull();
    const now = await s.read();
    expect(now.sections.home.map((x: Doc) => x.id)).toEqual(["hero-y"]);
    expect(homeOf(now, "hero-y").settings.heading).toBe("Визи соседняя");
  });

  it("мерчант правил секцию, Визи удалил: секция осталась", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Мерчант"),
    );
    const edit = withSetting(
      withoutSection(s.base, "hero-x"),
      "hero-y",
      "heading",
      "Визи соседняя",
    );
    const res = await s.write(edit, "r0", { writer: "vizi" });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].incoming).toBeNull();
    const now = await s.read();
    expect(now.sections.home.map((x: Doc) => x.id)).toEqual([
      "hero-x",
      "hero-y",
    ]);
    expect(homeOf(now, "hero-x").settings.heading).toBe("Мерчант");
  });

  it("разные поля сливаются без конфликта", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Мерчант"),
    );
    const res = await s.write(
      withSetting(s.base, "hero-x", "text", "Визи текст"),
      "r0",
      { writer: "vizi" },
    );
    expect(res).toMatchObject({
      success: true,
      conflicts: [],
      overwritten: [],
    });
    expect(homeOf(await s.read(), "hero-x").settings).toMatchObject({
      heading: "Мерчант",
      text: "Визи текст",
    });
  });

  it("Визи добавил секцию, мерчант удалил соседнюю: конфликта нет", async () => {
    const s = await afterMerchant((d) => withoutSection(d, "hero-y"));
    const added = clone(s.base);
    added.sections.home.splice(1, 0, hero("hero-new", { heading: "Новая" }));
    const res = await s.write(added, "r0", { writer: "vizi" });
    expect(res).toMatchObject({
      success: true,
      conflicts: [],
      overwritten: [],
    });
    expect((await s.read()).sections.home.map((x: Doc) => x.id).sort()).toEqual(
      ["hero-new", "hero-x"],
    );
  });

  it("«ничего не легло»: ревизии нет, голова на месте", async () => {
    const s = await afterMerchant((d) =>
      withSetting(d, "hero-x", "heading", "Мерчант"),
    );
    const revisionsBefore = s.fake.revisions.size;
    const res = await s.write(
      withSetting(s.base, "hero-x", "heading", "Визи"),
      "r0",
      { writer: "vizi" },
    );
    expect(res.success).toBe(true);
    // База была устаревшей и слияние посчитано — merged: true, хотя ревизия не записана.
    expect(res.merged).toBe(true);
    expect(res.conflicts).toHaveLength(1);
    expect(res.checkScope).toEqual({ sections: [], pages: [], theme: false });
    expect(res.revisionId).toBe(s.merchantHead);
    expect(res.currentRevisionId).toBe(s.merchantHead);
    expect(s.fake.revisions.size).toBe(revisionsBefore);
    expect(s.fake.site.currentRevisionId).toBe(s.merchantHead);
  });

  it("запись агента от свежей базы — обычная ревизия без конфликтов", async () => {
    const s = await setup();
    const res = await s.write(
      withSetting(await s.read("r0"), "hero-x", "text", "Визи"),
      "r0",
      { writer: "vizi" },
    );
    expect(res).toMatchObject({ success: true, merged: false, conflicts: [] });
    expect(res.currentRevisionId).toBe(s.fake.site.currentRevisionId);
  });
});

describe("К3: ключ от повторов", () => {
  const KEY = "key-1";

  it("повтор: тот же ответ с replayed, одна ревизия", async () => {
    const { fake, read, write } = await setup();
    const edit = withSetting(await read("r0"), "hero-x", "text", "Визи");
    const first = await write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(first.success).toBe(true);
    expect(first.replayed).toBeUndefined();
    const stored = fake.revisions.size;

    const again = await write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(again).toMatchObject({
      success: true,
      replayed: true,
      revisionId: first.revisionId,
      currentRevisionId: first.currentRevisionId,
      merged: first.merged,
      overwritten: first.overwritten,
      conflicts: first.conflicts,
      checkScope: first.checkScope,
    });
    expect(fake.revisions.size).toBe(stored);
  });

  it("повтор после слияния отдаёт ответ слияния, правка второй раз не применяется", async () => {
    const s = await setup();
    const base = await s.read("r0");
    await s.write(withSetting(base, "hero-x", "heading", "Мерчант"), "r0");
    const edit = withSetting(base, "hero-y", "heading", "Визи");
    const first = await s.write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(first).toMatchObject({ merged: true, conflicts: [] });
    const size = s.fake.revisions.size;

    const again = await s.write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(again).toMatchObject({
      replayed: true,
      merged: true,
      revisionId: first.revisionId,
      currentRevisionId: first.currentRevisionId,
    });
    expect(s.fake.revisions.size).toBe(size);
  });

  it("два параллельных с одним ключом — одна ревизия, у обоих один ответ", async () => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const [a, b] = await Promise.all([
      write(withSetting(base, "hero-x", "text", "A"), "r0", {
        writer: "vizi",
        idempotencyKey: KEY,
      }),
      write(withSetting(base, "hero-x", "text", "B"), "r0", {
        writer: "vizi",
        idempotencyKey: KEY,
      }),
    ]);
    expect([a.success, b.success]).toEqual([true, true]);
    expect(fake.revisions.size).toBe(2);
    expect(a.currentRevisionId).toBe(b.currentRevisionId);
    expect(a.revisionId).toBe(b.revisionId);
    expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
  });

  it("тот же ключ с другим телом — сохранённый ответ", async () => {
    const { fake, read, write } = await setup();
    const base = await read("r0");
    const first = await write(withSetting(base, "hero-x", "text", "A"), "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    const other = await write(withSetting(base, "hero-y", "text", "B"), "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(other).toMatchObject({
      replayed: true,
      currentRevisionId: first.currentRevisionId,
    });
    expect(fake.revisions.size).toBe(2);
    expect(
      homeOf(await (async () => fake.currentData())(), "hero-y").settings,
    ).not.toHaveProperty("text");
  });

  it("ключ другого магазина не пересекается", async () => {
    const { fake, read, write } = await setup();
    fake.seedRevision(
      "foreign",
      { sections: {} },
      {
        siteId: "site-2",
        idempotencyKey: KEY,
        meta: {
          reply: { revisionId: "foreign", currentRevisionId: "foreign" },
        },
      },
    );
    const res = await write(
      withSetting(await read("r0"), "hero-x", "text", "A"),
      "r0",
      { writer: "vizi", idempotencyKey: KEY },
    );
    expect(res.success).toBe(true);
    expect(res.replayed).toBeUndefined();
    expect(res.currentRevisionId).not.toBe("foreign");
  });

  it("«ничего не легло» ключ не запоминает: повтор пересчитывается", async () => {
    const s = await setup();
    const base = await s.read("r0");
    await s.write(withSetting(base, "hero-x", "heading", "Мерчант"), "r0");
    const edit = withSetting(base, "hero-x", "heading", "Визи");
    const size = s.fake.revisions.size;
    const first = await s.write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    const second = await s.write(edit, "r0", {
      writer: "vizi",
      idempotencyKey: KEY,
    });
    expect(first.replayed).toBeUndefined();
    expect(second.replayed).toBeUndefined();
    expect(second.conflicts).toHaveLength(1);
    expect(s.fake.revisions.size).toBe(size);
  });

  it("запись без ключа повторов не знает", async () => {
    const { fake, read, write } = await setup();
    const edit = withSetting(await read("r0"), "hero-x", "text", "A");
    await write(edit, "r0", { writer: "vizi" });
    const again = await write(edit, "r0", { writer: "vizi" });
    expect(again.replayed).toBeUndefined();
    expect(fake.revisions.size).toBe(3);
  });

  it("ключ не строка или длиннее 255 — отказ, ревизия не пишется", async () => {
    const { fake, read, write } = await setup();
    const edit = withSetting(await read("r0"), "hero-x", "text", "A");
    for (const idempotencyKey of [123, "k".repeat(256), ""]) {
      const res = await write(edit, "r0", { writer: "vizi", idempotencyKey });
      expect(res).toMatchObject({
        success: false,
        message: "invalid_idempotency_key",
      });
    }
    expect(fake.revisions.size).toBe(1);
  });
});
