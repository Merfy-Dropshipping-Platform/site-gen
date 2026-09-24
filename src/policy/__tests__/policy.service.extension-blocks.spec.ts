/**
 * Тесты PolicyService.setExtensionBlocks -- оркестрация: сколько сайтов у
 * арендатора, для каждого сайта/типа (privacy, tos) вычислить новый контент
 * через setExtensionBlock и записать через существующий upsert.
 *
 * db замокан только для schema.site (поиск сайтов арендатора, единственный
 * НОВЫЙ SQL-запрос в этом методе, роутинг по идентичности таблицы -- как в
 * sites.service.spec.ts / pages-service-*.spec.ts).
 * getBySiteId и upsert -- существующие, уже рабочие методы PolicyService;
 * они замоканы через jest.spyOn на прототипе, чтобы не переизобретать
 * select/insert/update мок для sitePolicy (где() по siteId+type нельзя
 * различить без парсинга drizzle-условия -- getBySiteId фильтрует только по
 * siteId, а upsert ещё и по type, оба бьют в одну и ту же таблицу).
 */
import { PolicyService, type PolicyData } from "../policy.service";
import { setExtensionBlock } from "../extension-block";
import * as schema from "../../db/schema";

function makeSiteDb(siteIds: string[]) {
  return {
    select() {
      return {
        from(table: any) {
          return {
            where() {
              if (table === schema.site) {
                return Promise.resolve(siteIds.map((id) => ({ id })));
              }
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  } as any;
}

function makePolicyRow(
  siteId: string,
  type: string,
  content: string,
): PolicyData {
  return {
    id: `${siteId}-${type}`,
    siteId,
    type,
    content,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

describe("PolicyService.setExtensionBlocks", () => {
  it("два сайта x два типа (privacy, tos) -> четыре upsert, sites=2", async () => {
    const db = makeSiteDb(["site-1", "site-2"]);
    const service = new PolicyService(db);

    jest.spyOn(service, "getBySiteId").mockResolvedValue([]);
    const upsertCalls: Array<{
      siteId: string;
      type: string;
      content: string;
    }> = [];
    jest
      .spyOn(service, "upsert")
      .mockImplementation(async (siteId, type, content) => {
        upsertCalls.push({ siteId, type, content });
        return makePolicyRow(siteId, type, content);
      });

    const result = await service.setExtensionBlocks("tenant-1", "reviews", {
      privacy: "Цель обработки: демонстрация",
      tos: "Правила программы: демонстрация",
    });

    expect(result).toEqual({ sites: 2 });
    expect(upsertCalls).toHaveLength(4);

    const bySite = (siteId: string) =>
      upsertCalls
        .filter((c) => c.siteId === siteId)
        .map((c) => c.type)
        .sort();
    expect(bySite("site-1")).toEqual(["privacy", "tos"]);
    expect(bySite("site-2")).toEqual(["privacy", "tos"]);

    for (const call of upsertCalls) {
      const expectedText =
        call.type === "privacy"
          ? "Цель обработки: демонстрация"
          : "Правила программы: демонстрация";
      expect(call.content).toBe(setExtensionBlock("", "reviews", expectedText));
    }
  });

  it("blocks=null убирает блок с обоих типов на сайте, где он был", async () => {
    const db = makeSiteDb(["site-1"]);
    const service = new PolicyService(db);

    const existingPrivacy = setExtensionBlock(
      "Действующая политика конфиденциальности.",
      "reviews",
      "Цель обработки",
    );
    const existingTos = setExtensionBlock(
      "Действующие правила.",
      "reviews",
      "Правила программы",
    );

    jest
      .spyOn(service, "getBySiteId")
      .mockResolvedValue([
        makePolicyRow("site-1", "privacy", existingPrivacy),
        makePolicyRow("site-1", "tos", existingTos),
      ]);
    const upsertCalls: Array<{
      siteId: string;
      type: string;
      content: string;
    }> = [];
    jest
      .spyOn(service, "upsert")
      .mockImplementation(async (siteId, type, content) => {
        upsertCalls.push({ siteId, type, content });
        return makePolicyRow(siteId, type, content);
      });

    const result = await service.setExtensionBlocks(
      "tenant-1",
      "reviews",
      null,
    );

    expect(result).toEqual({ sites: 1 });
    expect(upsertCalls).toHaveLength(2);
    const privacyCall = upsertCalls.find((c) => c.type === "privacy");
    const tosCall = upsertCalls.find((c) => c.type === "tos");
    expect(privacyCall?.content).toBe(
      "Действующая политика конфиденциальности.",
    );
    expect(tosCall?.content).toBe("Действующие правила.");
  });

  it("неизменённый контент не пишется -- только тип, где контент реально меняется", async () => {
    const db = makeSiteDb(["site-1"]);
    const service = new PolicyService(db);

    // privacy уже содержит ровно тот блок, который мы собираемся установить
    // -> setExtensionBlock вернёт тот же контент -> upsert не должен вызваться.
    const alreadyCorrectPrivacy = setExtensionBlock(
      "",
      "reviews",
      "Цель обработки",
    );

    jest
      .spyOn(service, "getBySiteId")
      .mockResolvedValue([
        makePolicyRow("site-1", "privacy", alreadyCorrectPrivacy),
      ]);
    const upsertCalls: Array<{
      siteId: string;
      type: string;
      content: string;
    }> = [];
    jest
      .spyOn(service, "upsert")
      .mockImplementation(async (siteId, type, content) => {
        upsertCalls.push({ siteId, type, content });
        return makePolicyRow(siteId, type, content);
      });

    await service.setExtensionBlocks("tenant-1", "reviews", {
      privacy: "Цель обработки",
      tos: "Правила программы",
    });

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].type).toBe("tos");
  });

  it("blocks с одним заданным типом -- отсутствующий тип не трогается", async () => {
    const db = makeSiteDb(["site-1"]);
    const service = new PolicyService(db);

    const existingTos = setExtensionBlock(
      "Действующие правила.",
      "reviews",
      "Старые правила",
    );
    jest
      .spyOn(service, "getBySiteId")
      .mockResolvedValue([makePolicyRow("site-1", "tos", existingTos)]);
    const upsertCalls: Array<{
      siteId: string;
      type: string;
      content: string;
    }> = [];
    jest
      .spyOn(service, "upsert")
      .mockImplementation(async (siteId, type, content) => {
        upsertCalls.push({ siteId, type, content });
        return makePolicyRow(siteId, type, content);
      });

    // blocks не содержит tos -- блок в tos остаётся как был.
    await service.setExtensionBlocks("tenant-1", "reviews", {
      privacy: "Цель обработки",
    });

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      siteId: "site-1",
      type: "privacy",
      content: setExtensionBlock("", "reviews", "Цель обработки"),
    });
  });

  it("нет сайтов у арендатора -> sites=0, upsert не вызывается", async () => {
    const db = makeSiteDb([]);
    const service = new PolicyService(db);

    jest.spyOn(service, "getBySiteId").mockResolvedValue([]);
    const upsertSpy = jest
      .spyOn(service, "upsert")
      .mockResolvedValue({} as PolicyData);

    const result = await service.setExtensionBlocks("tenant-1", "reviews", {
      privacy: "X",
    });

    expect(result).toEqual({ sites: 0 });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("siteId задан и принадлежит арендатору -> трогается только этот сайт, sites=1", async () => {
    // Мок возвращает ровно один сайт -- как проверка принадлежности
    // (id+tenantId+deletedAt is null), так и listTenantSiteIds бьют в одну и
    // ту же таблицу schema.site, роутинг по идентичности таблицы (см.
    // комментарий выше файла).
    const db = makeSiteDb(["site-1"]);
    const service = new PolicyService(db);

    jest.spyOn(service, "getBySiteId").mockResolvedValue([]);
    const upsertCalls: Array<{
      siteId: string;
      type: string;
      content: string;
    }> = [];
    jest
      .spyOn(service, "upsert")
      .mockImplementation(async (siteId, type, content) => {
        upsertCalls.push({ siteId, type, content });
        return makePolicyRow(siteId, type, content);
      });

    const result = await service.setExtensionBlocks(
      "tenant-1",
      "reviews",
      { privacy: "Цель обработки" },
      "site-1",
    );

    expect(result).toEqual({ sites: 1 });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({ siteId: "site-1", type: "privacy" });
  });

  it("siteId задан, но сайт не принадлежит арендатору -> отказ, upsert не вызывается", async () => {
    // Пустой список -- как будто запрос id+tenantId+deletedAt is null ничего
    // не нашёл (чужой tenant, чужой сайт или удалён).
    const db = makeSiteDb([]);
    const service = new PolicyService(db);

    jest.spyOn(service, "getBySiteId").mockResolvedValue([]);
    const upsertSpy = jest
      .spyOn(service, "upsert")
      .mockResolvedValue({} as PolicyData);

    await expect(
      service.setExtensionBlocks(
        "tenant-1",
        "reviews",
        { privacy: "X" },
        "foreign-site",
      ),
    ).rejects.toThrow("site does not belong to tenant");

    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
