import { getTableColumns } from "drizzle-orm";
import { site, siteThemeMigrations } from "../schema";

describe("siteThemeMigrations schema", () => {
  it("exports a Drizzle pgTable with expected columns", () => {
    expect(siteThemeMigrations).toBeDefined();
    const cols = getTableColumns(siteThemeMigrations);
    const names = Object.keys(cols);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "siteId",
        "fromTheme",
        "fromVersion",
        "toTheme",
        "toVersion",
        "report",
        "timestamp",
      ]),
    );
  });

  it("declares site_id as notNull text column", () => {
    const cols = getTableColumns(siteThemeMigrations);
    const siteIdCol = cols.siteId;
    expect(siteIdCol).toBeDefined();
    expect(siteIdCol.notNull).toBe(true);
    expect(siteIdCol.dataType).toBe("string");
  });

  it("declares report as notNull jsonb column", () => {
    const cols = getTableColumns(siteThemeMigrations);
    const reportCol = cols.report;
    expect(reportCol).toBeDefined();
    expect(reportCol.notNull).toBe(true);
  });
});

describe("site table — theme version columns", () => {
  it("exposes themeVersion (nullable) column", () => {
    const cols = getTableColumns(site);
    expect(cols.themeVersion).toBeDefined();
    expect(cols.themeVersion.notNull).toBe(false);
    expect(cols.themeVersion.dataType).toBe("string");
  });

  it("exposes needsRebuild (notNull, default false) column", () => {
    const cols = getTableColumns(site);
    expect(cols.needsRebuild).toBeDefined();
    expect(cols.needsRebuild.notNull).toBe(true);
    expect(cols.needsRebuild.hasDefault).toBe(true);
  });
});
