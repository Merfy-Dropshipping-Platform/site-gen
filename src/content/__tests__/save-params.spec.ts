/**
 * Недопустимые сочетания параметров записи — явная ошибка, а не тихий уход
 * в другой путь (ревью этапа 2):
 *  - `base` без `setCurrent` раньше молча уходил в старую запись без базы;
 *  - `base` вместе с `expectedVersion` (жёсткий CAS) — CAS молча игнорировался.
 */
import { DocumentAdapter } from "../document.adapter";
import { assertSaveParams } from "../store-content.port";
import type { SaveParams } from "../store-content.port";
import { SitesDomainService } from "../../sites.service";
import { makeFakeRevisionDb } from "./fake-revision-db";

const SITE = { themeId: "rose", publicUrl: null, currentRevisionId: "r0" };
const DOC = { pages: [], pagesData: {} };

function params(extra: Partial<SaveParams>): SaveParams {
  return { tenantId: "t-1", site: SITE, document: DOC, ...extra };
}

describe("параметры записи: недопустимые сочетания", () => {
  it.each<[string, Partial<SaveParams>, string]>([
    ["base без setCurrent", { base: "r0" }, "base_requires_set_current"],
    [
      "base вместе с expectedVersion",
      { base: "r0", setCurrent: true, expectedVersion: "r0" },
      "base_and_expected_version_are_exclusive",
    ],
    [
      "ни документа, ни операций",
      { document: undefined },
      "document_or_ops_required",
    ],
    [
      "и документ, и операции",
      { base: "r0", setCurrent: true, ops: [] },
      "document_and_ops_are_exclusive",
    ],
    ["операции без базы", { document: undefined, ops: [] }, "ops_require_base"],
  ])("%s → %s", (_label, extra, error) => {
    expect(() => assertSaveParams(params(extra))).toThrow(error);
  });

  it.each<[string, Partial<SaveParams>]>([
    ["старая запись без базы", { setCurrent: true }],
    ["жёсткий CAS", { setCurrent: true, expectedVersion: "r0" }],
    ["запись с базой", { setCurrent: true, base: "r0" }],
    [
      "операции от базы",
      { setCurrent: true, base: "r0", document: undefined, ops: [] },
    ],
  ])("допустимо: %s", (_label, extra) => {
    expect(() => assertSaveParams(params(extra))).not.toThrow();
  });

  it("адаптер проверяет до записи: ничего не записано", async () => {
    const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "t-1" });
    fake.seedRevision("r0", DOC);
    const adapter = new DocumentAdapter(fake.db, async () => ({}));
    await expect(
      adapter.save("site-1", params({ base: "r0" })),
    ).rejects.toThrow("base_requires_set_current");
    expect(fake.revisions.size).toBe(1);
  });

  it("createRevision с expectedCurrentRevisionId и base сразу — явная ошибка", async () => {
    const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "t-1" });
    fake.seedRevision("r0", DOC);
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
    await expect(
      service.createRevision({
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
