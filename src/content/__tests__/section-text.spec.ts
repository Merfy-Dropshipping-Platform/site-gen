import { SitesDomainService } from "../../sites.service";
import { DocumentAdapter } from "../document.adapter";
import { sectionRolesOf } from "../section-roles";
import { cleanSectionText } from "../section-text";
import type { SaveOnBaseParams } from "../store-content.port";
import { makeFakeRevisionDb } from "./fake-revision-db";

// Текст с начертаниями при записи ревизии (этап 0 базовых секций, E14): у полей string и text с ai остаются только
// <em> и <strong> без атрибутов — до записи, и с базой (конструктор, MCP), и вслепую.
type Doc = Record<string, any>;
const SITE = "site-1";
const TENANT = "tenant-1";
const HERO = {
  sdk: 1,
  name: "hero",
  kind: "section",
  title: "Первый экран",
  settings: [
    {
      id: "heading",
      label: "Заголовок",
      setting: { kind: "string", default: "", ai: "title" },
    },
    { id: "label", label: "Подпись", setting: { kind: "string", default: "" } },
  ],
  blocks: {
    text: {
      title: "Текст",
      limit: 1,
      settings: [
        {
          id: "text",
          label: "Текст",
          setting: { kind: "text", default: "", ai: "description" },
        },
      ],
    },
  },
};
const BAD =
  '<strong onclick="alert(1)">Скидки</strong><img src=x onerror=alert(1)><script>alert(2)</script>';
const CLEAN = "<strong>Скидки</strong>";
const hero = (settings: Doc, text: string) => ({
  id: "hero-1",
  section: "shop:hero",
  settings,
  blocks: [{ id: "t-1", type: "text", settings: { text } }],
});

describe("cleanSectionText", () => {
  it("экземпляры с manifest — очищены по полям с ai; без manifest, поле без ai и другие ключи — как есть", () => {
    const other = {
      id: "x-1",
      section: "shop:other",
      settings: { heading: BAD },
    };
    const document = {
      sections: {
        home: [hero({ heading: BAD, label: BAD }, BAD), other],
        header: "не список",
      },
      menus: [{ id: "main" }],
    };
    expect(cleanSectionText(document, new Map([["shop:hero", HERO]]))).toEqual({
      sections: {
        home: [hero({ heading: CLEAN, label: BAD }, CLEAN), other],
        header: "не список",
      },
      menus: [{ id: "main" }],
    });
  });

  it("нет manifest или нет sections — документ тот же", () => {
    const document = { sections: { home: [hero({ heading: BAD }, BAD)] } };
    expect(cleanSectionText(document, new Map())).toBe(document);
    const empty = { pages: [] };
    expect(cleanSectionText(empty, new Map([["shop:hero", HERO]]))).toBe(empty);
  });

  it("роли — из тех же manifest", () => {
    const roles = sectionRolesOf(
      new Map<string, unknown>([
        ["shop:cart", { role: "cart" }],
        ["shop:hero", HERO],
      ]),
    );
    expect([...roles]).toEqual([["shop:cart", "cart"]]);
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
    fake.seedSection("shop:hero", HERO);
    const adapter = new DocumentAdapter(fake.db, async () => ({}));
    const site = () => ({
      themeId: "bloom",
      publicUrl: null,
      name: "Витрина",
      contentModel: "document",
      currentRevisionId: fake.site.currentRevisionId,
    });
    const doc = (await adapter.load(SITE, { site: site() })).document as Doc;
    return { fake, adapter, site, doc };
  }

  it("с базой (конструктор и MCP): в ревизии — очищенные значения", async () => {
    const { fake, adapter, site, doc } = await store();
    const saved = await adapter.save(SITE, {
      mode: "on-base",
      document: { ...doc, sections: { home: [hero({ heading: BAD }, BAD)] } },
      base: "r0",
      tenantId: TENANT,
      filterSeeded: true,
      actor: "merchant",
      source: "constructor",
      mergePolicy: "last-writer-wins",
      site: site(),
    } as SaveOnBaseParams);
    expect(fake.storedData(saved.version)?.sections.home).toEqual([
      hero({ heading: CLEAN }, CLEAN),
    ]);
  });

  it("вслепую: в ревизии — очищенные значения", async () => {
    const { fake, adapter, site, doc } = await store();
    const saved = await adapter.save(SITE, {
      mode: "blind",
      document: { ...doc, sections: { home: [hero({ heading: BAD }, BAD)] } },
      tenantId: TENANT,
      setCurrent: true,
      site: site(),
    } as any);
    expect(fake.storedData(saved.version)?.sections.home).toEqual([
      hero({ heading: CLEAN }, CLEAN),
    ]);
  });
});
