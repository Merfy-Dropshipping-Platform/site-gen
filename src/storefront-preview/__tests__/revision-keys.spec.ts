/**
 * Ключи ревизии новой темы (design.md блока 8 «Каркаса витрины», раздел 4):
 * `tokens` — правки токенов в форме блока 1, `settings` — настройки не про
 * вид. Конструктор пишет их рядом с `pages`/`pagesData`, порт `StoreContent`
 * обязан пропускать их без изменений: чтение (миграции, досев, адреса) их не
 * трогает, запись с базой хранит как есть, слияние устаревшей вкладки их не
 * теряет. Документ — настоящий свежий магазин bloom: конвейер чтения тот же,
 * что у конструктора.
 */
import { DocumentAdapter } from "../../content/document.adapter";
import type { SaveOnBaseParams } from "../../content/store-content.port";
import { makeFakeRevisionDb } from "../../content/__tests__/fake-revision-db";
import { SitesDomainService } from "../../sites.service";

type Doc = Record<string, any>;

const SITE = "site-1";
const TENANT = "tenant-1";
const TOKENS = { schemes: { "scheme-1": { primary: "#16a34a" } } };
const SETTINGS = {
  "logo-image": "https://minio.merfy.ru/merfy-sites/logo.png",
  "cart-type": "page",
};

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
  const initial = await makeBareService().buildInitialRevision("bloom");
  fake.seedRevision("r0", { ...initial, tokens: TOKENS, settings: SETTINGS });
  const adapter = new DocumentAdapter(fake.db, async () => ({}));
  const site = () => ({
    themeId: "bloom",
    publicUrl: null,
    name: "Витрина",
    contentModel: "document",
    currentRevisionId: fake.site.currentRevisionId,
  });
  const load = () => adapter.load(SITE, { site: site() });
  const save = (document: Doc, base: string) =>
    adapter.save(SITE, {
      mode: "on-base",
      document,
      base,
      tenantId: TENANT,
      filterSeeded: true,
      actor: "merchant",
      source: "constructor",
      mergePolicy: "last-writer-wins",
      site: site(),
    } as SaveOnBaseParams);
  return { fake, load, save };
}

describe("ключи tokens и settings новой темы проходят порт StoreContent", () => {
  it("чтение отдаёт их как есть", async () => {
    const { load } = await store();
    const { document } = await load();
    expect(document.tokens).toEqual(TOKENS);
    expect(document.settings).toEqual(SETTINGS);
  });

  it("запись с базой хранит их как есть, вместе с правкой", async () => {
    const { fake, load, save } = await store();
    const doc = (await load()).document as Doc;
    const tokens = { schemes: { "scheme-1": { primary: "#dc2626" } } };
    const saved = await save({ ...doc, tokens, settings: {} }, "r0");
    expect(fake.storedData(saved.version)).toMatchObject({
      tokens,
      settings: {},
    });
  });

  it("устаревшая вкладка: правка ключа другой вкладкой не теряется при слиянии", async () => {
    const { fake, load, save } = await store();
    const doc = (await load()).document as Doc;
    const first = await save(
      { ...doc, settings: { ...SETTINGS, "cart-type": "drawer" } },
      "r0",
    );
    const stale = await save(
      { ...doc, tokens: { root: { "radius-button": 0 } } },
      "r0",
    );
    expect(stale.effect?.merged).toBe(true);
    expect(fake.storedData(stale.version)).toMatchObject({
      tokens: { root: { "radius-button": 0 } },
      settings: { "cart-type": "drawer" },
    });
    expect(first.version).not.toBe(stale.version);
  });
});
