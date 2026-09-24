/**
 * Доводчик рождения магазина (этап 3, кусок 3.1): один проход двигает строку
 * по саге, упавший шаг повторяется с нарастающей паузой, два доводчика не
 * делают двойной работы, старые магазины (без состояния) не трогаются.
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, кусок
 * 3.1 «Готово, когда»: тест «довёл до ready» с имитацией падения REG.RU и
 * Coolify; тест «старые строки не тронуты»; два доводчика одновременно не
 * делают двойной работы.
 *
 * Внешние службы здесь — шаги-заглушки, которые меняют факты строки так же,
 * как настоящие шаги (`lifecycle.steps.ts`): сид ставит ревизию, провижининг —
 * домен и проект, маршрут — app/роутер. Падение REG.RU = провижининг бросает;
 * падение Coolify = маршрут бросает.
 */
import {
  StoreLifecycleReconciler,
  type LifecycleStepRunner,
} from "../store-lifecycle.reconciler";
import { LEASE_MS, RETRY_DELAYS_MS } from "../store-lifecycle";
import {
  FakeClock,
  InMemoryLifecycleRepository,
  deferred,
  makeSiteRow,
} from "../../__tests__/support/in-memory-lifecycle";

type StepName = keyof LifecycleStepRunner;

/** Шаги-заглушки: считают вызовы и меняют факты строки, как настоящие. */
function makeSteps(repo: InMemoryLifecycleRepository) {
  const calls: Array<{ step: StepName; siteId: string }> = [];
  const failures: Partial<Record<StepName, Array<Error | "noop">>> = {};
  const gates: Partial<Record<StepName, Promise<void>>> = {};

  const effects: Record<StepName, (siteId: string) => void> = {
    seed: (id) => {
      repo.rows.get(id)!.currentRevisionId = `rev-${id}`;
    },
    provision: (id) => {
      const row = repo.rows.get(id)!;
      row.domainId = `dom-${id}`;
      row.coolifyProjectUuid = `proj-${row.tenantId}`;
      row.publicUrl = `https://${id}.merfy.ru`;
      row.storageSlug = id;
    },
    route: (id) => {
      repo.rows.get(id)!.coolifyAppUuid = "central-proxy";
    },
  };

  const run = (step: StepName) => async (row: { id: string }) => {
    calls.push({ step, siteId: row.id });
    await gates[step];
    const planned = failures[step]?.shift();
    if (planned instanceof Error) throw planned;
    if (planned === "noop") return; // шаг «прошёл», но факт не появился
    effects[step](row.id);
  };

  const steps: LifecycleStepRunner = {
    seed: run("seed"),
    provision: run("provision"),
    route: run("route"),
  };
  const count = (step: StepName, siteId?: string) =>
    calls.filter((c) => c.step === step && (!siteId || c.siteId === siteId))
      .length;
  return { steps, calls, failures, gates, count };
}

function setup() {
  const clock = new FakeClock();
  const repo = new InMemoryLifecycleRepository(clock);
  const fake = makeSteps(repo);
  const reconciler = new StoreLifecycleReconciler(repo, fake.steps);
  return { clock, repo, reconciler, ...fake };
}

describe("доводчик: один проход — от reserved до ready", () => {
  it("свежая строка проходит seed → provision → route и становится ready", async () => {
    const { repo, reconciler, calls } = setup();
    repo.put(makeSiteRow({ id: "s1" }));

    const result = await reconciler.advance("s1");

    expect(result).toMatchObject({ claimed: true, state: "ready" });
    expect(calls.map((c) => c.step)).toEqual(["seed", "provision", "route"]);
    const row = repo.rows.get("s1")!;
    expect(row.lifecycle).toBe("ready");
    expect(row.lifecycleError).toBeNull();
    expect(row.lifecycleAttempts).toBe(0);
    expect(row.lifecycleNextAt).toBeNull();
    // Состояния видны по ходу, а не только в конце.
    expect(repo.records.map((r) => r.record.state)).toEqual([
      "seeded",
      "provisioned",
      "ready",
    ]);
  });

  it("выполненные шаги не повторяются: строка с ревизией и доменом начинает с маршрута", async () => {
    const { repo, reconciler, calls } = setup();
    repo.put(
      makeSiteRow({
        id: "s1",
        lifecycle: "provisioned",
        currentRevisionId: "rev-1",
        domainId: "dom-1",
        coolifyProjectUuid: "proj-1",
      }),
    );

    await reconciler.advance("s1");

    expect(calls.map((c) => c.step)).toEqual(["route"]);
    expect(repo.rows.get("s1")!.lifecycle).toBe("ready");
  });

  it("«остановиться после seeded»: только сид, строка сразу доступна следующему проходу", async () => {
    const { repo, reconciler, calls } = setup();
    repo.put(makeSiteRow({ id: "s1" }));

    const result = await reconciler.advance("s1", { stopAfter: "seeded" });

    expect(result).toMatchObject({ claimed: true, state: "seeded" });
    expect(calls.map((c) => c.step)).toEqual(["seed"]);
    expect(repo.rows.get("s1")!.lifecycleNextAt).toBeNull();
    expect(await repo.listDue(10)).toEqual(["s1"]);
  });
});

describe("доводчик: падения внешних служб и повторы", () => {
  it("упал REG.RU: failed с причиной, 1 попытка, пауза 30 с; раньше срока не трогает; потом доводит до ready", async () => {
    const { clock, repo, reconciler, failures, count } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    failures.provision = [
      new Error("domain.generate_subdomain: REG.RU timeout"),
    ];

    const first = await reconciler.advance("s1");

    expect(first).toMatchObject({ claimed: true, state: "failed" });
    const failed = repo.rows.get("s1")!;
    expect(failed.lifecycle).toBe("failed");
    expect(failed.lifecycleError).toBe(
      "provision: domain.generate_subdomain: REG.RU timeout",
    );
    expect(failed.lifecycleAttempts).toBe(1);
    expect(failed.lifecycleNextAt!.getTime()).toBe(
      clock.nowMs + RETRY_DELAYS_MS[0],
    );
    // Сид успел пройти до падения — он не теряется и не повторяется.
    expect(failed.currentRevisionId).toBe("rev-s1");

    // Время следующей попытки не пришло — доводчик строку не берёт.
    clock.advance(RETRY_DELAYS_MS[0] - 1);
    expect(await reconciler.advance("s1")).toMatchObject({ claimed: false });
    expect(await repo.listDue(10)).toEqual([]);
    expect(count("provision")).toBe(1);

    clock.advance(1);
    const second = await reconciler.advance("s1");

    expect(second).toMatchObject({ claimed: true, state: "ready" });
    expect(count("seed")).toBe(1);
    expect(count("provision")).toBe(2);
    const ready = repo.rows.get("s1")!;
    expect(ready.lifecycleError).toBeNull();
    expect(ready.lifecycleAttempts).toBe(0);
  });

  it("упал Coolify (маршрут) дважды: попытки копятся, пауза растёт по таблице, третья — ready", async () => {
    const { clock, repo, reconciler, failures, count } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    failures.route = [new Error("coolify: 502"), new Error("coolify: timeout")];

    await reconciler.advance("s1");
    expect(repo.rows.get("s1")!).toMatchObject({
      lifecycle: "failed",
      lifecycleError: "route: coolify: 502",
      lifecycleAttempts: 1,
    });

    clock.advance(RETRY_DELAYS_MS[0]);
    await reconciler.advance("s1");
    const second = repo.rows.get("s1")!;
    expect(second).toMatchObject({
      lifecycleError: "route: coolify: timeout",
      lifecycleAttempts: 2,
    });
    expect(second.lifecycleNextAt!.getTime()).toBe(
      clock.nowMs + RETRY_DELAYS_MS[1],
    );

    clock.advance(RETRY_DELAYS_MS[1]);
    await reconciler.advance("s1");
    expect(repo.rows.get("s1")!.lifecycle).toBe("ready");
    // Провижининг прошёл один раз — повторялся только упавший шаг.
    expect(count("provision")).toBe(1);
    expect(count("route")).toBe(3);
  });

  it("шаг «прошёл», но факт не появился (finishProvisioning глотает ошибку) — это провал, а не ready", async () => {
    const { repo, reconciler, failures } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    failures.provision = ["noop"];

    const result = await reconciler.advance("s1");

    expect(result).toMatchObject({ state: "failed" });
    expect(repo.rows.get("s1")!.lifecycleError).toMatch(/^provision: /);
    expect(repo.rows.get("s1")!.lifecycle).toBe("failed");
  });

  it("упал сид: строка остаётся без ревизии и повторяет сид", async () => {
    const { clock, repo, reconciler, failures, count } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    failures.seed = [new Error("seed exploded")];

    await reconciler.advance("s1");
    expect(repo.rows.get("s1")!).toMatchObject({
      lifecycle: "failed",
      lifecycleError: "seed: seed exploded",
    });
    expect(count("provision")).toBe(0);

    clock.advance(RETRY_DELAYS_MS[0]);
    await reconciler.advance("s1");
    expect(repo.rows.get("s1")!.lifecycle).toBe("ready");
    expect(count("seed")).toBe(2);
  });
});

describe("доводчик: конкуренция — два доводчика не делают двойной работы", () => {
  it("два прохода по одной строке одновременно: каждый шаг выполнен ровно один раз", async () => {
    const { repo, reconciler, gates, count } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    const provisionGate = deferred();
    gates.provision = provisionGate.promise;

    const first = reconciler.advance("s1");
    const second = reconciler.advance("s1");
    provisionGate.resolve();
    const results = await Promise.all([first, second]);

    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(count("seed")).toBe(1);
    expect(count("provision")).toBe(1);
    expect(count("route")).toBe(1);
    expect(repo.rows.get("s1")!.lifecycle).toBe("ready");
  });

  it("два тика (две реплики) по трём строкам: у каждой строки каждый шаг — один раз", async () => {
    const { repo, reconciler, gates, count } = setup();
    for (const id of ["a", "b", "c"]) repo.put(makeSiteRow({ id }));
    const gate = deferred();
    gates.seed = gate.promise;

    const ticks = Promise.all([reconciler.tick(10), reconciler.tick(10)]);
    gate.resolve();
    await ticks;

    for (const id of ["a", "b", "c"]) {
      expect(count("seed", id)).toBe(1);
      expect(count("provision", id)).toBe(1);
      expect(count("route", id)).toBe(1);
      expect(repo.rows.get(id)!.lifecycle).toBe("ready");
    }
  });

  it("проход упал посреди шага (процесс умер) — после аренды строку подбирает следующий", async () => {
    const { clock, repo, reconciler, count } = setup();
    repo.put(makeSiteRow({ id: "s1" }));
    // Имитация: кто-то взял строку и умер, ничего не записав.
    expect(await repo.claim("s1", LEASE_MS)).not.toBeNull();

    expect(await reconciler.advance("s1")).toMatchObject({ claimed: false });
    expect(count("seed")).toBe(0);

    clock.advance(LEASE_MS);
    expect(await reconciler.advance("s1")).toMatchObject({
      claimed: true,
      state: "ready",
    });
  });
});

describe("доводчик: старые строки не тронуты", () => {
  it("магазин без состояния (рождён старым путём) — доводчик его не видит и не двигает", async () => {
    const { repo, reconciler, calls } = setup();
    const legacy = repo.put(
      makeSiteRow({ id: "legacy", lifecycle: null, lifecycleAttempts: null }),
    );
    const before = { ...legacy };

    const tick = await reconciler.tick(10);
    const direct = await reconciler.advance("legacy");

    expect(tick.processed).toBe(0);
    expect(direct).toMatchObject({ claimed: false });
    expect(calls).toEqual([]);
    expect(repo.rows.get("legacy")).toEqual(before);
    expect(repo.records).toEqual([]);
  });

  it("готовые и удалённые магазины доводчик не берёт", async () => {
    const { repo, reconciler, calls } = setup();
    repo.put(makeSiteRow({ id: "done", lifecycle: "ready" }));
    repo.put(makeSiteRow({ id: "gone", deletedAt: new Date(0) }));

    await reconciler.tick(10);

    expect(calls).toEqual([]);
  });

  it("тик идёт только по «созревшим» строкам: отложенная повтором ждёт своего времени", async () => {
    const { clock, repo, reconciler, calls } = setup();
    repo.put(
      makeSiteRow({
        id: "later",
        lifecycle: "failed",
        lifecycleNextAt: new Date(clock.nowMs + 60_000),
      }),
    );
    repo.put(makeSiteRow({ id: "now" }));

    const tick = await reconciler.tick(10);

    expect(tick.processed).toBe(1);
    expect(new Set(calls.map((c) => c.siteId))).toEqual(new Set(["now"]));
  });
});
