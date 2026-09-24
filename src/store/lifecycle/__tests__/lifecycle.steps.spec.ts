/**
 * Шаги саги рождения магазина (этап 3, кусок 3.1): сид, провижининг, маршрут.
 *
 * Каждый шаг идемпотентен и о своём провале говорит исключением с причиной —
 * доводчик кладёт её в `lifecycle_error`. Здесь шаги проверяются по
 * отдельности на заглушках sites-сервиса, порта контента и справочника
 * организаций; то, как доводчик их склеивает, — в store-lifecycle.reconciler.spec.ts.
 */
import { StoreLifecycleSteps } from "../lifecycle.steps";
import type { LifecycleRow } from "../lifecycle.repository";
import { makeSiteRow } from "../../__tests__/support/in-memory-lifecycle";

function row(partial: Partial<LifecycleRow> = {}): LifecycleRow {
  return makeSiteRow({
    id: "s1",
    name: "Шёлк",
    themeId: "satin",
    tenantId: "t1",
    createdBy: "u1",
    ...partial,
  });
}

function makeDeps() {
  const saves: Array<{ siteId: string; params: any }> = [];
  const sites = {
    buildInitialRevision: jest.fn(async (themeId: string) => ({
      themeId,
      pages: [{ id: "home" }],
      pagesData: {},
    })),
    finishProvisioning: jest.fn(async () => ({
      publicUrl: "https://abc.merfy.ru",
      failures: {},
    })),
    ensureSiteHosting: jest.fn(async () => ({
      coolifyAppUuid: "central-proxy",
    })),
  };
  const content = {
    load: jest.fn(),
    save: jest.fn(async (siteId: string, params: any) => {
      saves.push({ siteId, params });
      return { version: "rev-new" };
    }),
  };
  const organizations = {
    nameOf: jest.fn(async () => "ООО Шёлк" as string | null),
  };
  const steps = new StoreLifecycleSteps(
    sites as any,
    content as any,
    organizations,
  );
  return { sites, content, organizations, saves, steps };
}

describe("шаг seed: стартовая ревизия выбранной темы через порт StoreContent", () => {
  it("пишет канон темы магазина текущей ревизией, с CAS «ревизии ещё нет»", async () => {
    const { steps, sites, saves } = makeDeps();

    await steps.seed(row());

    expect(sites.buildInitialRevision).toHaveBeenCalledWith("satin");
    expect(saves).toHaveLength(1);
    expect(saves[0].siteId).toBe("s1");
    expect(saves[0].params).toMatchObject({
      tenantId: "t1",
      actorUserId: "u1",
      setCurrent: true,
      expectedVersion: null,
      meta: { title: "Шёлк", actor: "system", source: "seed" },
      site: { themeId: "satin", currentRevisionId: null },
    });
    expect(saves[0].params.document).toEqual({
      themeId: "satin",
      pages: [{ id: "home" }],
      pagesData: {},
    });
    // Внутренняя запись канона — не фильтр конструктора.
    expect(saves[0].params.filterSeeded).toBeUndefined();
  });

  it("идемпотентен: ревизия уже есть — ничего не пишет", async () => {
    const { steps, saves, sites } = makeDeps();

    await steps.seed(row({ currentRevisionId: "rev-1" }));

    expect(saves).toHaveLength(0);
    expect(sites.buildInitialRevision).not.toHaveBeenCalled();
  });

  it("гонка двух сидов: второй получает revision_conflict и считает шаг выполненным", async () => {
    const { steps, content } = makeDeps();
    content.save.mockRejectedValueOnce(new Error("revision_conflict"));

    await expect(steps.seed(row())).resolves.toBeUndefined();
  });

  it("пустой канон темы — провал шага с причиной, а не магазин без ревизии", async () => {
    const { steps, sites } = makeDeps();
    sites.buildInitialRevision.mockResolvedValueOnce(null as any);

    await expect(steps.seed(row())).rejects.toThrow(/starter content/);
  });
});

describe("шаг provision: домен REG.RU + проект Coolify, имя компании решает sites", () => {
  it("имя компании — из справочника организаций (user-сервис)", async () => {
    const { steps, sites, organizations } = makeDeps();

    await steps.provision(row());

    expect(organizations.nameOf).toHaveBeenCalledWith("t1");
    expect(sites.finishProvisioning).toHaveBeenCalledWith(
      "s1",
      "t1",
      "ООО Шёлк",
    );
  });

  it("справочник не ответил — имя магазина (как у старого reaper)", async () => {
    const { steps, sites, organizations } = makeDeps();
    organizations.nameOf.mockResolvedValueOnce(null);

    await steps.provision(row());

    expect(sites.finishProvisioning).toHaveBeenCalledWith("s1", "t1", "Шёлк");
  });

  it("REG.RU не ответил: finishProvisioning вернул провал домена — шаг бросает с причиной", async () => {
    const { steps, sites } = makeDeps();
    sites.finishProvisioning.mockResolvedValueOnce({
      publicUrl: undefined as any,
      failures: { domain: "REG.RU timeout" },
    });

    await expect(steps.provision(row())).rejects.toThrow(
      "domain: REG.RU timeout",
    );
  });

  it("Coolify не создал проект — шаг бросает с причиной", async () => {
    const { steps, sites } = makeDeps();
    sites.finishProvisioning.mockResolvedValueOnce({
      publicUrl: "https://abc.merfy.ru",
      failures: { project: "coolify_project_create_failed" },
    });

    await expect(steps.provision(row())).rejects.toThrow(
      "project: coolify_project_create_failed",
    );
  });
});

describe("шаг route: маршрут хостинга (роутер центрального прокси или app Coolify)", () => {
  it("зовёт общий для reaper и саги ensureSiteHosting", async () => {
    const { steps, sites } = makeDeps();

    await steps.route(
      row({
        storageSlug: "abc",
        publicUrl: "https://abc.merfy.ru",
        coolifyProjectUuid: "p1",
      }),
    );

    expect(sites.ensureSiteHosting).toHaveBeenCalledWith("s1");
  });

  it("маршрут не поставился — шаг бросает с причиной", async () => {
    const { steps, sites } = makeDeps();
    sites.ensureSiteHosting.mockResolvedValueOnce({
      coolifyAppUuid: null,
      error: "coolify: 502",
    } as any);

    await expect(steps.route(row())).rejects.toThrow("coolify: 502");
  });
});
