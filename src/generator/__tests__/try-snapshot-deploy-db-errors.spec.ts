/**
 * `trySnapshotDeploy` не гасит сбой базы в «ревизии нет» — раньше
 * `storeContent.load(...).catch(() => null)` не различал «ревизии
 * действительно нет» от «база моргнула», и магазину с РЕАЛЬНЫМ содержимым
 * при сбое базы выкладывался бы шаблон темы поверх настоящей правки
 * (снэпшот-деплой создаёт ревизию из дефолтного контента, когда «ревизии
 * нет»). Фикс — `loadOrNull` (`document.adapter.ts`): «ревизии нет» —
 * `null`, любая другая ошибка пробрасывается.
 *
 * Фейковая БД — `content/__tests__/fake-revision-db.ts` (тот же приём, что у
 * `document.adapter.spec.ts`): `site`/`site_revision` разбираются по
 * таблице, `select` можно подменить точечно.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { trySnapshotDeploy, type BuildDependencies } from "../build.service";
import { makeFakeRevisionDb } from "../../content/__tests__/fake-revision-db";
import * as schema from "../../db/schema";

// `trySnapshotDeploy` шаг 1 требует РЕАЛЬНЫЙ каталог templates/astro/<templateId>/dist/
// (fs.stat) — настоящий временный каталог, а не мок fs: в этом наборе тестов
// нет прецедента мокать `fs/promises`, а точечная временная папка не рискует
// разойтись с реальным поведением fs.
const FAKE_TEMPLATE_ID = "__test-snapshot-db-errors__";
const TEMPLATE_DIST_DIR = path.join(
  process.cwd(),
  "templates",
  "astro",
  FAKE_TEMPLATE_ID,
  "dist",
);

beforeAll(async () => {
  await fs.mkdir(TEMPLATE_DIST_DIR, { recursive: true });
});

afterAll(async () => {
  await fs.rm(
    path.join(process.cwd(), "templates", "astro", FAKE_TEMPLATE_ID),
    {
      recursive: true,
      force: true,
    },
  );
  // Успешный прогон (тест «ревизии нет») пишет реальный zip-артефакт в
  // artifacts/<siteId>/ (gitignored, но не убирать за собой — плохая гигиена диска).
  await fs.rm(path.join(process.cwd(), "artifacts", "site-1"), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.join(process.cwd(), "artifacts", "site-2"), {
    recursive: true,
    force: true,
  });
});

function makeDeps(db: unknown): BuildDependencies {
  return {
    db: db as BuildDependencies["db"],
    schema: schema as unknown as BuildDependencies["schema"],
    productClient: {} as BuildDependencies["productClient"],
    // isEnabled: false — stageUpload/stageDeploy коротко замыкаются на
    // локальную запись файлов (см. build.service.ts:3114/3203), реального S3
    // тесту не нужно.
    s3: { isEnabled: async () => false } as unknown as BuildDependencies["s3"],
  };
}

describe("trySnapshotDeploy: сбой базы на проверке ревизии — не «ревизии нет»", () => {
  it("сбой базы при чтении ревизии с РЕАЛЬНЫМ содержимым → падает, шаблон не выкладывается, новой ревизии нет", async () => {
    const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "tenant-1" });
    // Реальная правка мерчанта — не дефолт, снэпшот обязан её не тронуть.
    fake.seedRevision("rev-real-content", {
      pages: [{ id: "home", name: "Главная" }],
      content: [{ type: "Hero", props: { title: "Настоящий магазин" } }],
    });
    const revisionsBefore = fake.revisions.size;

    // Сбой базы ИМЕННО на чтении ревизии (site читается штатно первым
    // select'ом внутри trySnapshotDeploy; второй select — DocumentAdapter,
    // за ним следит fetchRevision через site_revision).
    let selectCount = 0;
    const originalSelect = fake.db.select.bind(fake.db);
    fake.db.select = (...args: unknown[]) => {
      selectCount += 1;
      if (selectCount === 2) {
        throw new Error("connection terminated unexpectedly");
      }
      return originalSelect(...args);
    };

    const deps = makeDeps(fake.db);
    await expect(
      trySnapshotDeploy(deps, {
        tenantId: "tenant-1",
        siteId: "site-1",
        templateId: FAKE_TEMPLATE_ID,
      }),
    ).rejects.toThrow("connection terminated unexpectedly");

    // Ничего не записано: ни новой (блайнд) ревизии, ни сдвига указателя.
    expect(fake.revisions.size).toBe(revisionsBefore);
    expect(fake.site.currentRevisionId).toBe("rev-real-content");
  });

  it("контроль — «ревизии действительно нет» (не сбой базы) ведёт себя как раньше: создаёт блайнд-ревизию из дефолта", async () => {
    // Ни одной ревизии у магазина — currentRevisionId остаётся null.
    const fake = makeFakeRevisionDb({ id: "site-2", tenantId: "tenant-1" });
    const deps = makeDeps(fake.db);

    const result = await trySnapshotDeploy(deps, {
      tenantId: "tenant-1",
      siteId: "site-2",
      templateId: FAKE_TEMPLATE_ID,
    });

    // Снэпшот идёт по пути «ревизии нет»: создаёт блайнд-ревизию с дефолтным
    // контентом (не бросает, не «пусто» вместо явного результата).
    expect(fake.revisions.size).toBe(1);
    expect(result).not.toBeNull();
  });
});
