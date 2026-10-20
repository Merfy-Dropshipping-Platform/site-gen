import * as path from "path";
import { readFileSync } from "fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  OUT_OF_ORDER_FLOOR,
  pickSkippedMigrations,
} from "../skipped-migrations";

const migrationsFolder = path.join(__dirname, "../../../drizzle");
const journal: Array<{ tag: string; when: number }> = JSON.parse(
  readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
).entries;
const whenOf = (prefix: string) =>
  journal.find((e) => e.tag.startsWith(prefix))!.when;

describe("pickSkippedMigrations", () => {
  const migrations = readMigrationFiles({ migrationsFolder });

  it("граница — when миграции 0017", () => {
    expect(OUT_OF_ORDER_FLOOR).toBe(whenOf("0017_"));
  });

  it("всё применено (dev): доприменять нечего, 0009 без записи в базе не трогаем", () => {
    const applied = new Set(
      journal.filter((e) => !e.tag.startsWith("0009_")).map((e) => e.when),
    );
    expect(pickSkippedMigrations(migrations, applied)).toEqual([]);
  });

  it("на проде 0027 раньше 0018: доприменяет пропущенные, по порядку журнала", () => {
    const later = journal.filter((e) => e.when > OUT_OF_ORDER_FLOOR);
    const skippedTags = later.filter((e) => e.tag < "0027_").map((e) => e.tag);
    const applied = new Set(
      journal.filter((e) => !skippedTags.includes(e.tag)).map((e) => e.when),
    );
    const picked = pickSkippedMigrations(migrations, applied).map(
      (m) => m.folderMillis,
    );
    expect(picked).toEqual(skippedTags.map((t) => whenOf(t)));
  });
});
