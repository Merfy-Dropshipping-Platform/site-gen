import { SitesMicroserviceController } from "../../sites.microservice.controller";
import { saveOnBase } from "../save-on-base";
import type { RevisionStore } from "../save-on-base";
import { SectionIdDuplicateError, sectionIdDuplicates } from "../section-ids";
import { StoreContentService } from "../store-content.service";
import type { WriteModel } from "../write-model";

// id экземпляра секции создаёт тот, кто её добавляет (блок 1 «Секций и SDK»,
// п. 10); sites при записи ревизии проверяет, что на странице id не
// повторяются: повтор — ошибка записи section-id-duplicate, ничего не записано.
// Документ целиком — до записи, запись операциями — после операций.
const hero = (id: string) => ({ id, section: "shop:hero", settings: {} });

const IDENTITY_MODEL: WriteModel = {
  normalize: async (doc) => doc ?? {},
  filterForWrite: (doc) => doc,
  isAutoValue: () => false,
  isDerived: () => false,
};

describe("id секций на странице", () => {
  it("повтор на одной странице найден; один id на разных страницах — можно", () => {
    const document = {
      sections: {
        home: [
          hero("hero-k3f9x2a1"),
          hero("hero-k3f9x2a1"),
          hero("hero-p0q9w8e7"),
        ],
        about: [hero("hero-p0q9w8e7")],
      },
    };
    expect(sectionIdDuplicates(document)).toEqual([
      { page: "home", id: "hero-k3f9x2a1" },
    ]);
  });

  it("списки имён у магазинов нынешних тем, нет ключа sections, не объект — повторов нет", () => {
    expect(
      sectionIdDuplicates({ sections: { home: ["shop:hero", "shop:hero"] } }),
    ).toEqual([]);
    expect(sectionIdDuplicates({ tokens: {} })).toEqual([]);
    expect(sectionIdDuplicates(null)).toEqual([]);
  });

  it("запись документа с повтором — отказ, до адаптера запись не доходит", async () => {
    const adapter = { save: jest.fn() };
    const service = new StoreContentService(adapter as never);
    const document = { sections: { home: [hero("hero-1"), hero("hero-1")] } };
    const params = {
      mode: "blind",
      site: { themeId: "nova", publicUrl: null },
      document,
    };
    await expect(
      service.save("site-1", params as never),
    ).rejects.toBeInstanceOf(SectionIdDuplicateError);
    expect(adapter.save).not.toHaveBeenCalled();
  });

  it("запись операциями: повтор после операций — отказ, ничего не записано", async () => {
    const commit = jest.fn(async () => true);
    const store: RevisionStore = {
      fetchData: async () => ({ sections: { home: [hero("hero-1")] } }),
      readPointer: async () => "r0",
      writeModel: async () => IDENTITY_MODEL,
      commit,
    };
    const params = {
      mode: "on-base",
      base: "r0",
      mergePolicy: "reject-conflicts",
      tenantId: "tenant-1",
      site: { themeId: "nova", publicUrl: null, currentRevisionId: "r0" },
      ops: [
        {
          op: "set",
          path: "sections/home",
          value: [hero("hero-1"), hero("hero-1")],
        },
      ],
    };
    const logger = { log: () => undefined, warn: () => undefined };
    await expect(
      saveOnBase(store, "site-1", params as never, logger as never),
    ).rejects.toBeInstanceOf(SectionIdDuplicateError);
    expect(commit).not.toHaveBeenCalled();
  });

  it("RPC sites.revisions.create: код section-id-duplicate и список повторов", async () => {
    const duplicates = [{ page: "home", id: "hero-1" }];
    const domain = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new SectionIdDuplicateError(duplicates)),
    };
    const controller = new SitesMicroserviceController(domain as never);
    await expect(
      controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
      }),
    ).resolves.toEqual({
      success: false,
      code: "section-id-duplicate",
      message: "section-id-duplicate",
      duplicates,
    });
  });
});

describe("id блоков внутри экземпляра (блок 1 «Секций и SDK», часть 3)", () => {
  const faq = (id: string, blocks: unknown) => ({
    id,
    section: "shop:faq",
    settings: {},
    blocks,
  });
  const question = (id: string) => ({ id, type: "question", settings: {} });

  it("повтор id блока в одном экземпляре — повтор «экземпляр/блок»; один id блока в разных экземплярах — можно", () => {
    const document = {
      sections: {
        home: [
          faq("faq-1", [
            question("question-1"),
            question("question-1"),
            question("question-2"),
          ]),
          faq("faq-2", [question("question-1")]),
        ],
      },
    };
    expect(sectionIdDuplicates(document)).toEqual([
      { page: "home", id: "faq-1/question-1" },
    ]);
  });

  it("повторы экземпляров — первыми, потом блоков; blocks не список или блок без id — не повтор", () => {
    const document = {
      sections: {
        home: [
          faq("faq-1", [question("q-1"), question("q-1")]),
          faq("faq-1", "не список"),
          faq("faq-3", [{ type: "question" }, { type: "question" }]),
        ],
      },
    };
    expect(sectionIdDuplicates(document)).toEqual([
      { page: "home", id: "faq-1" },
      { page: "home", id: "faq-1/q-1" },
    ]);
  });
});
