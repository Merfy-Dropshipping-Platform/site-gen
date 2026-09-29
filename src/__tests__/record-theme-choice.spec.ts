/**
 * `SitesDomainService.recordThemeChoice` — строка магазина после смены темы
 * командой `SetTheme` (этап 3, кусок 3.3): `themeId` и дата выбора темы.
 * Ревизию команда пишет сама через порт `StoreContent`; здесь — только `site`,
 * в границе тенанта.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { SitesDomainService } from "../sites.service";
import * as schema from "../db/schema";

const render = (cond: unknown) => new PgDialect().sqlToQuery(cond as any);

function makeService(returning: Array<{ id: string }>) {
  const writes: Array<{
    table: unknown;
    set: any;
    where: { sql: string; params: unknown[] };
  }> = [];
  const db: any = {
    update: (table: unknown) => ({
      set: (set: any) => ({
        where: (cond: unknown) => {
          writes.push({ table, set, where: render(cond) });
          return { returning: async () => returning };
        },
      }),
    }),
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
    dep,
  );
  return { service, writes };
}

describe("recordThemeChoice", () => {
  it("пишет themeId, дату выбора темы и автора — только в строке этого тенанта", async () => {
    const { service, writes } = makeService([{ id: "s1" }]);

    const ok = await service.recordThemeChoice({
      tenantId: "t1",
      siteId: "s1",
      themeId: "satin",
      actorUserId: "u1",
    });

    expect(ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe(schema.site);
    expect(writes[0].set).toMatchObject({ themeId: "satin", updatedBy: "u1" });
    expect(writes[0].set.themeAppliedAt).toBeInstanceOf(Date);
    expect(writes[0].where.sql).toMatch(
      /"site"\."id" = \$1 and "site"\."tenant_id" = \$2/,
    );
    expect(writes[0].where.params).toEqual(["s1", "t1"]);
  });

  it("чужой магазин — false, ничего не записано", async () => {
    const { service } = makeService([]);
    expect(
      await service.recordThemeChoice({
        tenantId: "other",
        siteId: "s1",
        themeId: "satin",
      }),
    ).toBe(false);
  });
});
