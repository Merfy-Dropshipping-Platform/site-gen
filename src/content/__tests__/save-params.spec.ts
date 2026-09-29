/**
 * Форма записи выбирается явно (`mode`), и невозможные сочетания не
 * доходят до записи (ревью этапа 2):
 *  - порт: невозможное запрещает ТИП `SaveParams`. Проверка — компилятор:
 *    строка под `@ts-expect-error` обязана быть ошибкой типа, иначе ошибка
 *    уже сама директива. Типы в jest проверяются в CI (`CI=true`), локально —
 *    `tsc -p tsconfig.json --noEmit`;
 *  - провод (`createRevision`, данные RPC без типов): те же сочетания —
 *    явная ошибка до записи. Раньше `base` без `setCurrent` молча уходил в
 *    старую запись без базы, `base` вместе с жёстким CAS — CAS молча
 *    игнорировался.
 */
import { DocumentAdapter } from "../document.adapter";
import type { SaveParams } from "../store-content.port";
import { SitesDomainService } from "../../sites.service";
import { makeFakeRevisionDb } from "./fake-revision-db";

const SITE = { themeId: "rose", publicUrl: null, currentRevisionId: "r0" };
const DOC = { pages: [], pagesData: {} };
const COMMON = { tenantId: "t-1", site: SITE };
const ON_BASE = {
  ...COMMON,
  mode: "on-base",
  base: "r0",
  mergePolicy: "last-writer-wins",
} as const;

describe("порт: невозможные сочетания запрещает тип", () => {
  it("вслепую нельзя передать базу — запись от базы выбирается явно", () => {
    const params: SaveParams = {
      ...COMMON,
      mode: "blind",
      document: DOC,
      // @ts-expect-error — `base` есть только у формы "on-base"
      base: "r0",
    };
    expect(params.mode).toBe("blind");
  });

  it("от базы нельзя передать жёсткий CAS", () => {
    const params: SaveParams = {
      ...ON_BASE,
      document: DOC,
      // @ts-expect-error — `expectedVersion` есть только у формы "blind"
      expectedVersion: "r0",
    };
    expect(params.mode).toBe("on-base");
  });

  it("от базы — документ или операции, хотя бы одно", () => {
    // @ts-expect-error — нет ни `document`, ни `ops`
    const params: SaveParams = { ...ON_BASE };
    expect(params.mode).toBe("on-base");
  });

  it("от базы — документ или операции, не оба сразу", () => {
    // @ts-expect-error — `document` и `ops` взаимоисключающие
    const params: SaveParams = { ...ON_BASE, document: DOC, ops: [] };
    expect(params.mode).toBe("on-base");
  });

  it("операции — только от базы", () => {
    // @ts-expect-error — у формы "blind" нет `ops`, документ обязателен
    const params: SaveParams = { ...COMMON, mode: "blind", ops: [] };
    expect(params.mode).toBe("blind");
  });
});

describe("порт: допустимые формы записывают ревизию", () => {
  it.each<[string, SaveParams]>([
    ["вслепую", { ...COMMON, mode: "blind", document: DOC, setCurrent: true }],
    [
      "вслепую с жёстким CAS",
      {
        ...COMMON,
        mode: "blind",
        document: DOC,
        setCurrent: true,
        expectedVersion: "r0",
      },
    ],
    ["от базы, документом", { ...ON_BASE, document: DOC }],
    ["от базы, операциями", { ...ON_BASE, ops: [] }],
  ])("%s", async (_label, params) => {
    const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "t-1" });
    fake.seedRevision("r0", DOC);
    const adapter = new DocumentAdapter(fake.db, async () => ({}));
    const saved = await adapter.save("site-1", params);
    expect(fake.revisions.size).toBe(2);
    expect(fake.site.currentRevisionId).toBe(saved.version);
  });
});

describe("провод: createRevision отвергает невозможное до записи", () => {
  function service() {
    const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "t-1" });
    fake.seedRevision("r0", DOC);
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
    return { fake, sites };
  }

  it("база без setCurrent — явная ошибка, ничего не записано", async () => {
    const { fake, sites } = service();
    await expect(
      sites.createRevision({
        tenantId: "t-1",
        siteId: "site-1",
        data: DOC,
        base: "r0",
      }),
    ).rejects.toThrow("base_requires_set_current");
    expect(fake.revisions.size).toBe(1);
  });

  it("createRevision с expectedCurrentRevisionId и base сразу — явная ошибка", async () => {
    const { fake, sites } = service();
    await expect(
      sites.createRevision({
        tenantId: "t-1",
        siteId: "site-1",
        data: DOC,
        setCurrent: true,
        expectedCurrentRevisionId: "r0",
        base: "r0",
      }),
    ).rejects.toThrow("base_and_expected_version_are_exclusive");
    expect(fake.revisions.size).toBe(1);
  });
});
