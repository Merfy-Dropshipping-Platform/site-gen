/**
 * Запись с базой и «не правки» (дополнение главного агента к этапу 2):
 *
 *  1. Автозначения панели. Конструктор при правке одного поля секции вписывает
 *     `defaultProps` панели в ключи, которых в секции не было. Устаревшая
 *     вкладка не должна этим затереть чужую правку того же ключа, а в
 *     `meta.changes` такие значения — не правка мерчанта.
 *  2. Копии шапки и подвала на внутренних страницах — в `meta.changes` не
 *     правка, считаются отдельно (`meta.derived.chromeCopies`).
 *
 * Значения по умолчанию панели подставляются источником-заглушкой (боевой —
 * тот же puck-config, что получает конструктор; см. panel-defaults.ts).
 */
import { DocumentAdapter } from "../document.adapter";
import { SitesDomainService } from "../../sites.service";
import type { SaveParams } from "../store-content.port";
import { makeFakeRevisionDb } from "./fake-revision-db";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";
const ALIGN = "page:home/block:Hero-1/props/alignment";
const HEADING = "page:home/block:Hero-1/props/heading/text";

/** Дефолт панели для ключа, которого в свежем магазине bloom у героя нет. */
const PANEL = { Hero: { alignment: "center" } };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function hero(doc: Doc): Doc {
  return doc.pagesData.home.content.find((b: Doc) => b.props?.id === "Hero-1")
    .props;
}

async function freshStore() {
  const fake = makeFakeRevisionDb({
    id: SITE,
    tenantId: TENANT,
    themeId: "bloom",
  });
  const dep = {} as any;
  const bare: any = new SitesDomainService(
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  fake.seedRevision("r0", await bare.buildInitialRevision("bloom"));
  const adapter = new DocumentAdapter(fake.db, async () => PANEL);
  const site = () => ({
    themeId: "bloom",
    publicUrl: null,
    name: "Витрина",
    contentModel: "document",
    currentRevisionId: fake.site.currentRevisionId,
  });
  const load = async (): Promise<Doc> =>
    (await adapter.load(SITE, { site: site() })).document;
  const save = (document: Doc, base: string, extra: Partial<SaveParams> = {}) =>
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
  return { fake, load, save };
}

describe("автозначения панели при записи с базой", () => {
  it("устаревшая вкладка вписала дефолт — чужая настоящая правка того же ключа выживает", async () => {
    const { fake, load, save } = await freshStore();
    const tab = await load();

    const other = clone(await load());
    hero(other).alignment = "left";
    await save(other, "r0");

    const stale = clone(tab);
    hero(stale).heading = { ...hero(stale).heading, text: "Моё" };
    hero(stale).alignment = "center"; // updateProp вписал defaultProps панели
    const saved = await save(stale, "r0");

    expect(saved.effect?.merged).toBe(true);
    expect(saved.effect?.overwritten).toEqual([]);
    const now = await load();
    expect(hero(now).alignment).toBe("left");
    expect(hero(now).heading.text).toBe("Моё");
    expect(fake.storedMeta(saved.version).changes).toEqual([HEADING]);
  });

  it("строгая политика: автозначение — не конфликт", async () => {
    const { load, save } = await freshStore();
    const tab = await load();
    const other = clone(await load());
    hero(other).alignment = "left";
    await save(other, "r0");

    const stale = clone(tab);
    hero(stale).alignment = "center";
    hero(stale).subtitle = "Моя правка";
    const saved = await save(stale, "r0", { mergePolicy: "reject-conflicts" });
    expect(saved.effect?.conflicts).toEqual([]);
    expect(hero(await load()).alignment).toBe("left");
  });

  it("быстрый путь: вписанный дефолт хранится как прислали, но в meta.changes не правка", async () => {
    const { fake, load, save } = await freshStore();
    const doc = clone(await load());
    hero(doc).alignment = "center";
    hero(doc).heading = { ...hero(doc).heading, text: "Моё" };
    const saved = await save(doc, "r0");

    expect(saved.effect?.merged).toBe(false);
    expect(hero(fake.storedData(saved.version)).alignment).toBe("center");
    expect(fake.storedMeta(saved.version)).toMatchObject({
      changes: [HEADING],
      derived: { panelDefaults: 1 },
    });
    expect(fake.storedMeta(saved.version).changes).not.toContain(ALIGN);
  });
});

describe("копии служебных блоков на внутренних страницах", () => {
  it("правка шапки: в changes только главная, копии — числом в derived", async () => {
    const { fake, load, save } = await freshStore();
    const doc = clone(await load());
    const pages: Doc[] = Object.values(doc.pagesData);
    for (const page of pages) {
      const header = page?.content?.find?.((b: Doc) => b.type === "Header");
      if (header) header.props.testField = "новая шапка"; // syncSharedSections
    }
    const saved = await save(doc, "r0");

    const meta = fake.storedMeta(saved.version);
    expect(meta.changes).toEqual(["page:home/block:Header-1/props/testField"]);
    expect(meta.derived.chromeCopies).toBeGreaterThan(0);
  });
});
