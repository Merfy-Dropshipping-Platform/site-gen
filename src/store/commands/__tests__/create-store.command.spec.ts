/**
 * Команда «создать магазин» (этап 3, кусок 3.2; инварианты И1–И3).
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md.
 *   И1 — одна команда для всех входов; магазин рождается сразу на выбранной
 *        теме, одна стартовая ревизия, без пересева; тема по умолчанию объявлена
 *        в одном месте;
 *   И2 — лимит магазинов решает sites, один раз (402-контракт шлюза прежний:
 *        `shops_limit_reached` с `limit/current`);
 *   И3 — у магазина видно состояние рождения; `wait:true` ждёт `ready` с
 *        таймаутом и отвечает текущим состоянием.
 *
 * Хранилище — память (`InMemoryStoreRegistry` + `InMemoryLifecycleRepository`
 * над общими строками), шаги саги — настоящие `StoreLifecycleSteps` поверх
 * заглушек sites-сервиса и порта контента: так видно, что стартовая ревизия
 * одна и она той темы, которую выбрали.
 */
import {
  THEMES,
  catalogOf,
  makeCreateStoreHarness,
} from "../../__tests__/support/create-store-harness";
import {
  deferred,
  makeSiteRow,
} from "../../__tests__/support/in-memory-lifecycle";
import { LEASE_MS } from "../../lifecycle/store-lifecycle";
import type { StoreRegistryTx } from "../../store-registry";

const setup = makeCreateStoreHarness;

const base = { tenantId: "t1", actorUserId: "u1", name: "Шёлк" };

describe("CreateStore: магазин рождается сразу на выбранной теме (И1)", () => {
  it("тема из команды — в строке магазина и в ЕДИНСТВЕННОЙ стартовой ревизии; пересева нет", async () => {
    const { command, saves, repo, sites } = setup();

    const result = await command.execute({ ...base, themeId: "satin" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const store = result.effect.store!;
    expect(store.themeId).toBe("satin");
    expect(repo.rows.get(store.id)!.themeId).toBe("satin");
    await command.settle();
    expect(saves).toHaveLength(1);
    expect(saves[0].params.document.themeId).toBe("satin");
    expect(sites.buildInitialRevision).toHaveBeenCalledTimes(1);
    expect(sites.buildInitialRevision).toHaveBeenCalledWith("satin");
  });

  it.each(THEMES)(
    "каждая из пяти тем: %s — магазин и ревизия на ней",
    async (theme) => {
      const { command, saves } = setup();
      const result = await command.execute({ ...base, themeId: theme });
      await command.settle();
      expect(result.ok && result.effect.store!.themeId).toBe(theme);
      expect(saves.map((s) => s.params.document.themeId)).toEqual([theme]);
    },
  );

  it("без темы — тема по умолчанию из каталога (объявлена в одном месте)", async () => {
    const { command, saves } = setup({ catalog: catalogOf(THEMES, "flux") });

    const result = await command.execute(base);
    await command.settle();

    expect(result.ok && result.effect.store!.themeId).toBe("flux");
    expect(saves[0].params.document.themeId).toBe("flux");
  });

  it("неизвестный слаг темы — ошибка со списком доступных; магазин не создаётся, биллинг не спрашивается", async () => {
    const { command, registry, billing } = setup();

    const result = await command.execute({ ...base, themeId: "opechatka" });

    expect(result).toEqual({
      ok: false,
      error: { code: "unknown_theme", themeId: "opechatka", available: THEMES },
    });
    expect(registry.inserted).toHaveLength(0);
    expect(billing.readEntitlements).not.toHaveBeenCalled();
  });

  it("стартовая ревизия пишется через порт StoreContent с пометкой «сид, система»", async () => {
    const { command, saves } = setup();
    await command.execute({ ...base, themeId: "bloom" });
    expect(saves[0].params.meta).toEqual({
      title: "Шёлк",
      actor: "system",
      source: "seed",
    });
    expect(saves[0].params.expectedVersion).toBeNull();
  });
});

describe("CreateStore: эффект в ответе и состояние рождения (И3)", () => {
  it("wait:false — ответ сразу после сида: магазин «seeded», дальше доводит фон", async () => {
    const { command, repo } = setup();

    const result = await command.execute({ ...base, themeId: "rose" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect).toMatchObject({
      created: true,
      waited: false,
      ready: false,
      store: {
        tenantId: "t1",
        name: "Шёлк",
        slug: "shyolk",
        themeId: "rose",
        status: "draft",
        publicUrl: null,
        lifecycle: { state: "seeded", error: null, attempts: 0 },
      },
    });
    await command.settle();
    expect(repo.rows.get(result.effect.store!.id)!.lifecycle).toBe("ready");
  });

  it("wait:true — ждёт ready и отдаёт publicUrl в ответе", async () => {
    const { command } = setup();

    const result = await command.execute({
      ...base,
      themeId: "rose",
      wait: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.waited).toBe(true);
    expect(result.effect.ready).toBe(true);
    expect(result.effect.store!.lifecycle.state).toBe("ready");
    expect(result.effect.store!.publicUrl).toMatch(/^https:\/\/.+\.merfy\.ru$/);
  });

  it("wait:true, провижининг висит — по таймауту отвечает текущим состоянием, магазин доходит до ready позже", async () => {
    const { command, repo, provisionGate } = setup();
    const gate = deferred();
    provisionGate.current = gate.promise;

    const result = await command.execute({
      ...base,
      themeId: "rose",
      wait: true,
      waitTimeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.ready).toBe(false);
    expect(result.effect.store!.lifecycle.state).toBe("seeded");
    gate.resolve();
    await command.settle();
    expect(repo.rows.get(result.effect.store!.id)!.lifecycle).toBe("ready");
  });

  it("упал REG.RU при wait:true — магазин создан, ответ несёт failed с причиной и временем повтора", async () => {
    const { command, sites } = setup();
    sites.finishProvisioning.mockResolvedValueOnce({
      publicUrl: undefined,
      failures: { domain: "REG.RU timeout" },
    });

    const result = await command.execute({
      ...base,
      themeId: "rose",
      wait: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effect.created).toBe(true);
    expect(result.effect.store!.lifecycle).toMatchObject({
      state: "failed",
      error: "provision: domain: REG.RU timeout",
      attempts: 1,
    });
    expect(result.effect.store!.lifecycle.nextAt).toEqual(expect.any(String));
  });

  it("событие sites.site.created — та же форма, что у старого reserve() (на неё подписан user-сервис)", async () => {
    const { command, events } = setup();
    const result = await command.execute({ ...base, themeId: "rose" });
    const created = events.find((e) => e.pattern === "sites.site.created");
    expect(created?.payload).toEqual({
      tenantId: "t1",
      siteId: result.ok ? result.effect.store!.id : "",
      name: "Шёлк",
      slug: "shyolk",
      publicUrl: null,
    });
  });
});

describe("CreateStore: тик доводчика не перехватывает новую строку (В3)", () => {
  /**
   * Тик доводчика «успевает» ровно между коммитом вставки и сидом команды:
   * после `withTenantLock` конкурент берёт всё созревшее, как настоящий тик.
   * Раньше строка вставлялась с пустым `lifecycle_next_at` — тик её захватывал,
   * `advance` команды получал `claimed: false`, и ответ `created: true` уходил
   * без ревизии.
   */
  function withCompetingTick(h: ReturnType<typeof setup>) {
    const competing: unknown[] = [];
    const lockAndInsert = h.registry.withTenantLock.bind(h.registry);
    h.registry.withTenantLock = async <T>(
      tenantId: string,
      work: (tx: StoreRegistryTx) => Promise<T>,
    ): Promise<T> => {
      const reservation = await lockAndInsert(tenantId, work);
      for (const id of await h.repo.listDue(10)) {
        competing.push(await h.repo.claim(id, LEASE_MS));
      }
      return reservation;
    };
    return competing;
  }

  it("wait:false — строка вставлена арендованной: тик её не берёт, ответ уже с ревизией", async () => {
    const h = setup();
    const competing = withCompetingTick(h);

    const result = await h.command.execute({ ...base, themeId: "rose" });

    expect(competing).toEqual([]);
    expect(h.saves).toHaveLength(1);
    expect(result.ok && result.effect.store!.lifecycle.state).toBe("seeded");
    await h.command.settle();
    expect([...h.repo.rows.values()][0].lifecycle).toBe("ready");
  });

  it("wait:true — то же: тик не вмешивается, команда доводит до ready сама", async () => {
    const h = setup();
    const competing = withCompetingTick(h);

    const result = await h.command.execute({
      ...base,
      themeId: "rose",
      wait: true,
    });

    expect(competing).toEqual([]);
    expect(result.ok && result.effect.ready).toBe(true);
    expect(h.saves).toHaveLength(1);
  });

  it("пока команда не ответила, аренда вставки у неё; после ответа wait:false доводит тот же проход", async () => {
    const h = setup();
    const gate = deferred();
    h.provisionGate.current = gate.promise;

    const result = await h.command.execute({ ...base, themeId: "rose" });
    const row = h.repo.rows.get(result.ok ? result.effect.store!.id : "")!;

    // Команда ответила на «seeded» и продолжает фоном — аренда всё ещё её.
    expect(row.lifecycle).toBe("seeded");
    expect(row.lifecycleNextAt!.getTime()).toBeGreaterThan(h.repo.clock.nowMs);
    expect(await h.repo.listDue(10)).toEqual([]);
    gate.resolve();
    await h.command.settle();
    expect(row.lifecycle).toBe("ready");
    expect(row.lifecycleNextAt).toBeNull();
  });
});

describe("CreateStore: лимит решает sites, один раз (И2)", () => {
  it("лимит исчерпан — shops_limit_reached с limit и current; строка не вставлена", async () => {
    const { command, repo, registry } = setup({
      entitlements: { shopsLimit: 1 },
    });
    repo.put(makeSiteRow({ id: "existing", tenantId: "t1", lifecycle: null }));

    const result = await command.execute({ ...base, themeId: "rose" });

    expect(result).toEqual({
      ok: false,
      error: { code: "shops_limit_reached", limit: 1, current: 1 },
    });
    expect(registry.inserted).toHaveLength(0);
  });

  it("архивные и удалённые магазины в лимит не идут (как считал reserve())", async () => {
    const { command, repo } = setup({ entitlements: { shopsLimit: 1 } });
    repo.put(makeSiteRow({ id: "arch", status: "archived", lifecycle: null }));
    repo.put(
      makeSiteRow({ id: "del", deletedAt: new Date(0), lifecycle: null }),
    );

    const result = await command.execute({ ...base, themeId: "rose" });

    expect(result.ok).toBe(true);
  });

  it("заморозка витрины — account_frozen (поведение reserve() сохранено)", async () => {
    const { command } = setup({ entitlements: { storefrontSuspended: true } });
    const result = await command.execute({ ...base, themeId: "rose" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "account_frozen" },
    });
  });

  it("биллинг спрашивается ровно один раз на команду", async () => {
    const { command, billing } = setup();
    await command.execute({ ...base, themeId: "rose", wait: true });
    expect(billing.readEntitlements).toHaveBeenCalledTimes(1);
    expect(billing.readEntitlements).toHaveBeenCalledWith("t1");
  });

  it("две одновременные команды у лимита (лимит 1, магазинов 0) — проходит ровно одна", async () => {
    const { command, registry } = setup({ entitlements: { shopsLimit: 1 } });

    const [a, b] = await Promise.all([
      command.execute({ ...base, name: "Первый", themeId: "rose" }),
      command.execute({ ...base, name: "Второй", themeId: "flux" }),
    ]);

    const outcomes = [a, b]
      .map((r) => (r.ok ? "created" : r.error.code))
      .sort();
    expect(outcomes).toEqual(["created", "shops_limit_reached"]);
    expect(registry.inserted).toHaveLength(1);
    const refused = [a, b].find((r) => !r.ok);
    expect(refused).toEqual({
      ok: false,
      error: { code: "shops_limit_reached", limit: 1, current: 1 },
    });
  });

  it("биллинг не ответил: кабинет и регистрация — по умолчанию тарифа (как раньше), cron «без магазина» — отказ", async () => {
    const unknown = { degraded: true, shopsLimit: 1 };
    const cabinet = setup({ entitlements: unknown });
    const registration = setup({ entitlements: unknown });
    const missing = setup({ entitlements: unknown });

    const r1 = await cabinet.command.execute({
      ...base,
      themeId: "rose",
      source: "cabinet",
    });
    const r2 = await registration.command.execute({
      ...base,
      source: "registration",
      ifNoStores: true,
    });
    const r3 = await missing.command.execute({
      ...base,
      source: "missing-store",
      ifNoStores: true,
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3).toEqual({ ok: false, error: { code: "billing_unavailable" } });
    expect(missing.registry.inserted).toHaveLength(0);
  });
});

describe("CreateStore: «только если у тенанта ещё нет магазинов» (регистрация и cron)", () => {
  it("магазин уже есть — ничего не создаётся, эффект говорит почему", async () => {
    const { command, repo, registry } = setup();
    repo.put(makeSiteRow({ id: "existing", lifecycle: null }));

    const result = await command.execute({
      ...base,
      ifNoStores: true,
      source: "registration",
    });

    expect(result).toEqual({
      ok: true,
      effect: {
        created: false,
        reason: "tenant_has_stores",
        storeCount: 1,
        waited: false,
        ready: false,
      },
    });
    expect(registry.inserted).toHaveLength(0);
  });

  it("регистрация и cron одновременно для нового тенанта — магазин ровно один", async () => {
    const { command, registry } = setup();

    await Promise.all([
      command.execute({
        ...base,
        name: "Мой сайт",
        ifNoStores: true,
        source: "registration",
      }),
      command.execute({
        ...base,
        name: "Мой магазин",
        ifNoStores: true,
        source: "missing-store",
      }),
    ]);

    expect(registry.inserted).toHaveLength(1);
  });
});

describe("CreateStore: слаг магазина (Н4)", () => {
  it("кириллица транслитерируется; занятый слаг получает -1, -2", async () => {
    const { command, repo } = setup();
    repo.put(makeSiteRow({ id: "x", slug: "moy-magazin", lifecycle: null }));
    repo.put(makeSiteRow({ id: "y", slug: "moy-magazin-1", lifecycle: null }));

    const result = await command.execute({ ...base, name: "Мой Магазин" });

    expect(result.ok && result.effect.store!.slug).toBe("moy-magazin-2");
  });

  it("слаг из команды нормализуется так же, как из имени", async () => {
    const { command } = setup();
    const result = await command.execute({ ...base, slug: "Мой-Слаг Тест" });
    expect(result.ok && result.effect.store!.slug).toBe("moy-slag-test");
  });

  it("слаг занят в ДРУГОМ тенанте — не мешает", async () => {
    const { command, repo } = setup();
    repo.put(
      makeSiteRow({
        id: "x",
        tenantId: "other",
        slug: "shyolk",
        lifecycle: null,
      }),
    );
    const result = await command.execute(base);
    expect(result.ok && result.effect.store!.slug).toBe("shyolk");
  });
});

describe("CreateStore: вход проверяется по схеме", () => {
  it.each([
    ["без имени", { tenantId: "t1", actorUserId: "u1" }],
    ["пустое имя", { tenantId: "t1", actorUserId: "u1", name: "   " }],
    ["без тенанта", { actorUserId: "u1", name: "X" }],
    ["без автора", { tenantId: "t1", name: "X" }],
    ["чужой источник", { ...base, source: "hacker" }],
    ["таймаут ожидания вне рамок", { ...base, wait: true, waitTimeoutMs: 10 }],
  ])("%s → invalid_input", async (_title, input) => {
    const { command, registry, billing } = setup();
    const result = await command.execute(input);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(registry.inserted).toHaveLength(0);
    expect(billing.readEntitlements).not.toHaveBeenCalled();
  });
});
