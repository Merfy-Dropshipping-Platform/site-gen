/**
 * «Отменить записи агента с ревизии R» (этап 6 Визи, Ч2) — через настоящий RPC
 * `sites.revisions.undo_agent`, записи — через `sites.revisions.create` с
 * автором от шлюза, фейковая БД ревизий (`fake-revision-db.ts`), магазин nova.
 * Алгоритм по месту — `content/__tests__/undo-agent.spec.ts`.
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

function withSetting(doc: Doc, id: string, key: string, value: unknown): Doc {
  const next = clone(doc);
  homeOf(next, id).settings[key] = value;
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
  /** Запись от текущей: `writer` — автор от шлюза. */
  const write = async (
    change: (doc: Doc) => Doc,
    writer?: string,
  ): Promise<any> => {
    const base = fake.site.currentRevisionId!;
    return controller.createRevision({
      tenantId: TENANT,
      siteId: SITE,
      data: change(await read(base)),
      setCurrent: true,
      expectedCurrentRevisionId: base,
      writer,
    });
  };
  const undo = (extra: Doc = {}): Promise<any> =>
    controller.undoAgentRevisions({
      tenantId: TENANT,
      siteId: SITE,
      since: "r0",
      writer: "vizi",
      ...extra,
    });
  return { fake, controller, read, write, undo };
}

describe("sites.revisions.undo_agent", () => {
  it("правки Визи уходят, правка мерчанта остаётся; ревизия agent/vizi с restoredFrom", async () => {
    const { fake, read, write, undo } = await setup();
    await write((d) => withSetting(d, "hero-x", "heading", "Визи"), "vizi");
    await write((d) => withSetting(d, "hero-y", "heading", "Мерчант"));
    await write((d) => withSetting(d, "hero-x", "text", "Визи 2"), "vizi");

    const res = await undo();
    expect(res).toMatchObject({ success: true, restoredFrom: "r0", kept: [] });
    expect(res.undone.sort()).toEqual([
      "sections/home/hero-x/settings/heading",
      "sections/home/hero-x/settings/text",
    ]);
    expect(fake.site.currentRevisionId).toBe(res.revisionId);
    expect(fake.storedMeta(res.revisionId)).toMatchObject({
      actor: "agent",
      source: "vizi",
      restoredFrom: "r0",
      undoAgent: { since: "r0" },
    });
    const after = await read();
    expect(homeOf(after, "hero-x").settings).toMatchObject({
      heading: "Было",
      text: "Текст",
    });
    expect(homeOf(after, "hero-y").settings.heading).toBe("Мерчант");
  });

  it("мерчант правил поле после Визи: оно в kept, остальное отменено", async () => {
    const { read, write, undo } = await setup();
    await write(
      (d) =>
        withSetting(
          withSetting(d, "hero-x", "heading", "Визи"),
          "hero-y",
          "heading",
          "Визи",
        ),
      "vizi",
    );
    await write((d) => withSetting(d, "hero-x", "heading", "Мерчант"));

    const res = await undo();
    expect(res.kept).toEqual([
      {
        path: "sections/home/hero-x/settings/heading",
        reason: "changed_after_agent",
        by: { actor: "merchant", source: "constructor" },
      },
    ]);
    const after = await read();
    expect(homeOf(after, "hero-x").settings.heading).toBe("Мерчант");
    expect(homeOf(after, "hero-y").settings.heading).toBe("Соседняя");
  });

  it("повтор: второй раз — ничего не изменилось, ревизия не пишется", async () => {
    const { fake, write, undo } = await setup();
    await write((d) => withSetting(d, "hero-x", "heading", "Визи"), "vizi");
    const first = await undo({ idempotencyKey: "undo-1" });
    expect(first.revisionId).toEqual(expect.any(String));
    const count = fake.revisions.size;

    const second = await undo({ idempotencyKey: "undo-1" });
    expect(second).toMatchObject({
      success: true,
      revisionId: null,
      undone: [],
    });
    expect(fake.revisions.size).toBe(count);
    expect(fake.site.currentRevisionId).toBe(first.revisionId);
  });

  it("scope одной секции: вторая секция Визи остаётся", async () => {
    const { read, write, undo } = await setup();
    await write(
      (d) =>
        withSetting(
          withSetting(d, "hero-x", "heading", "Визи"),
          "hero-y",
          "heading",
          "Визи",
        ),
      "vizi",
    );
    const res = await undo({
      scope: { sections: [{ page: "home", id: "hero-y" }] },
    });
    expect(res.undone).toEqual(["sections/home/hero-y/settings/heading"]);
    const after = await read();
    expect(homeOf(after, "hero-x").settings.heading).toBe("Визи");
    expect(homeOf(after, "hero-y").settings.heading).toBe("Соседняя");
  });

  it("агент MCP отменяет только свои записи, записи Визи не трогает", async () => {
    const { read, write, undo } = await setup();
    await write((d) => withSetting(d, "hero-x", "heading", "Визи"), "vizi");
    await write((d) => withSetting(d, "hero-y", "heading", "MCP"), "agent");
    const res = await undo({ writer: "agent" });
    expect(res.undone).toEqual(["sections/home/hero-y/settings/heading"]);
    const after = await read();
    expect(homeOf(after, "hero-x").settings.heading).toBe("Визи");
    expect(homeOf(after, "hero-y").settings.heading).toBe("Соседняя");
  });

  it("гонка: мерчант записал то же место перед фиксацией — пересчёт, его значение остаётся", async () => {
    const { fake, read, write, undo } = await setup();
    await write((d) => withSetting(d, "hero-x", "heading", "Визи"), "vizi");
    const raced = withSetting(await read(), "hero-x", "heading", "Мерчант");
    fake.hooks.beforeCas = () =>
      fake.seedRevision("m-race", raced, {
        meta: { actor: "merchant", source: "constructor" },
      });

    const res = await undo();
    expect(res.success).toBe(true);
    expect(res.revisionId).toBeNull();
    expect(res.kept.map((k: Doc) => k.path)).toEqual([
      "sections/home/hero-x/settings/heading",
    ]);
    expect(fake.site.currentRevisionId).toBe("m-race");
  });

  it("R — снимок клиента: отмена считается от его ревизии-слияния", async () => {
    const { fake, read, write, undo } = await setup();
    await write((d) => withSetting(d, "hero-x", "heading", "Визи"), "vizi");
    const merged = fake.site.currentRevisionId!;
    fake.seedRevision("snap", await read(merged), {
      current: false,
      meta: { kind: "client-snapshot", snapshotOf: merged },
    });
    await write((d) => withSetting(d, "hero-y", "heading", "Визи 2"), "vizi");

    const res = await undo({ since: "snap" });
    expect(res.restoredFrom).toBe(merged);
    expect(res.undone).toEqual(["sections/home/hero-y/settings/heading"]);
  });

  it.each([
    [{ writer: undefined }, "undo_agent_requires_agent"],
    [{ writer: "merchant" }, "undo_agent_requires_agent"],
    [{ since: "nope" }, "revision_not_found"],
    [{ scope: { sections: [{ page: "home" }] } }, "invalid_undo_scope"],
    [{ since: undefined }, "tenantId, siteId and since required"],
  ])("отказ %j → %s", async (extra, message) => {
    const { undo } = await setup();
    expect(await undo(extra)).toMatchObject({ success: false, message });
  });
});
