/**
 * Сборка команды `CreateStore` на памяти для тестов (этап 3, кусок 3.2).
 *
 * Хранилище — `InMemoryStoreRegistry` + `InMemoryLifecycleRepository` над
 * общими строками; шаги саги — настоящие `StoreLifecycleSteps` поверх заглушек
 * sites-сервиса (провижининг сразу ставит домен/проект/маршрут) и порта
 * контента (сохранение ставит текущую ревизию). Биллинг — заглушка
 * `readEntitlements`; `degraded: true` — «биллинг не ответил».
 * Нужна create-store.command.spec.ts и характеризационному тесту регистрации.
 */
import { CreateStoreCommand } from "../../commands/create-store.command";
import { StoreLifecycleReconciler } from "../../lifecycle/store-lifecycle.reconciler";
import { StoreLifecycleSteps } from "../../lifecycle/lifecycle.steps";
import type { CatalogTheme, ThemeCatalog } from "../../theme-catalog";
import { FakeClock, InMemoryLifecycleRepository } from "./in-memory-lifecycle";
import { InMemoryStoreRegistry } from "./in-memory-registry";

export const THEMES = ["rose", "flux", "satin", "bloom", "vanilla"];

export function catalogOf(
  ids: string[],
  defaultThemeId = "rose",
): ThemeCatalog {
  const themes: CatalogTheme[] = ids.map(
    (id) => ({ id, name: id, slug: id }) as CatalogTheme,
  );
  return {
    defaultThemeId,
    list: async () => themes,
    find: async (id: string) => themes.find((t) => t.id === id) ?? null,
  };
}

export type Entitlements = {
  shopsLimit: number;
  staffLimit: number;
  frozen: boolean;
  storefrontSuspended?: boolean;
  degraded?: boolean;
};

export function makeCreateStoreHarness(
  opts: { entitlements?: Partial<Entitlements>; catalog?: ThemeCatalog } = {},
) {
  const clock = new FakeClock();
  const repo = new InMemoryLifecycleRepository(clock);
  const registry = new InMemoryStoreRegistry(repo);

  const saves: Array<{ siteId: string; params: any }> = [];
  const provisionGate = { current: Promise.resolve() };
  const sites = {
    buildInitialRevision: jest.fn(async (themeId: string) => ({
      themeId,
      pages: [{ id: "home" }],
      pagesData: {},
    })),
    finishProvisioning: jest.fn(async (siteId: string) => {
      await provisionGate.current;
      const row = repo.rows.get(siteId)!;
      Object.assign(row, {
        domainId: `dom-${siteId}`,
        coolifyProjectUuid: "proj-1",
        publicUrl: `https://${siteId.slice(0, 8)}.merfy.ru`,
        storageSlug: siteId.slice(0, 8),
      });
      return { publicUrl: row.publicUrl ?? undefined, failures: {} };
    }),
    ensureSiteHosting: jest.fn(async (siteId: string) => {
      repo.rows.get(siteId)!.coolifyAppUuid = "central-proxy";
      return { coolifyAppUuid: "central-proxy" };
    }),
  };
  const content = {
    load: jest.fn(),
    save: jest.fn(async (siteId: string, params: any) => {
      saves.push({ siteId, params });
      repo.rows.get(siteId)!.currentRevisionId = `rev-${saves.length}`;
      return { version: `rev-${saves.length}` };
    }),
  };
  const organizations = {
    nameOf: jest.fn(async () => "ООО Тест" as string | null),
  };
  const steps = new StoreLifecycleSteps(
    sites as any,
    content as any,
    organizations,
  );
  const reconciler = new StoreLifecycleReconciler(repo, steps);

  const { degraded, ...entitlements }: Entitlements = {
    shopsLimit: 5,
    staffLimit: 1,
    frozen: false,
    ...opts.entitlements,
  };
  const billing = {
    readEntitlements: jest.fn(async () => ({
      entitlements: { ...entitlements },
      known: !degraded,
    })),
  };
  const events: Array<{ pattern: string; payload: any }> = [];
  const eventsService = {
    emit: (pattern: string, payload: any) => events.push({ pattern, payload }),
  };

  const command = new CreateStoreCommand(
    registry,
    opts.catalog ?? catalogOf(THEMES),
    billing as any,
    reconciler,
    repo,
    eventsService as any,
  );
  return {
    command,
    repo,
    registry,
    saves,
    sites,
    content,
    billing,
    events,
    provisionGate,
    organizations,
  };
}

// Jest считает тестовым любой .ts в __tests__/** — см. in-memory-lifecycle.ts.
function isOwnTestFile(): boolean {
  try {
    const testPath = (
      globalThis as { expect?: { getState?: () => { testPath?: string } } }
    ).expect?.getState?.().testPath;
    return testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe("create-store-harness", () => {
    it("собирает команду, которая создаёт магазин на памяти", async () => {
      const { command, repo } = makeCreateStoreHarness();
      const result = await command.execute({
        tenantId: "t1",
        actorUserId: "u1",
        name: "X",
      });
      await command.settle();
      expect(result.ok).toBe(true);
      expect([...repo.rows.values()].map((r) => r.lifecycle)).toEqual([
        "ready",
      ]);
    });
  });
