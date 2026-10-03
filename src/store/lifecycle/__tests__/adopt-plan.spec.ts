/**
 * Правило перевода старых магазинов в сагу (этап 3, кусок 3.8): только готовые
 * по фактам — тем же наблюдением, что у доводчика. Неготовые и уже живущие в
 * саге пропускаются с причиной.
 */
import { planAdoption, type AdoptDecision } from "../adopt-plan";
import type { LifecycleRow } from "../lifecycle.repository";

const row = (over: Partial<LifecycleRow> = {}): LifecycleRow => ({
  id: "s1", tenantId: "t1", name: "Shop", slug: "shop", status: "published", themeId: "rose",
  createdBy: null, publicUrl: null, currentRevisionId: "r1", domainId: "d1", coolifyProjectUuid: "p1",
  coolifyAppUuid: "a1", contentModel: null, lifecycle: null, lifecycleError: null,
  lifecycleAttempts: null, lifecycleNextAt: null, ...over,
});

function single(over: Partial<LifecycleRow>, projectRequired = true): AdoptDecision {
  return planAdoption([row(over)], projectRequired)[0];
}

describe("planAdoption: переводим только готовые по фактам магазины", () => {
  it("все факты на месте → adopt", () => {
    expect(single({})).toEqual({ siteId: "s1", name: "Shop", action: "adopt" });
  });

  it.each<Partial<LifecycleRow>>([
    { lifecycle: "ready" },
    { lifecycle: "failed" },
  ])("магазин уже в саге (%j) → skip / already_in_saga", (over) => {
    expect(single(over)).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "skip",
      reason: "already_in_saga",
    });
  });

  it("нет ревизии → not_ready, не хватает seed", () => {
    expect(single({ currentRevisionId: null })).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "skip",
      reason: "not_ready",
      missing: "seed",
    });
  });

  it("нет домена → not_ready, не хватает provision", () => {
    expect(single({ domainId: null })).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "skip",
      reason: "not_ready",
      missing: "provision",
    });
  });

  it("нет проекта Coolify: проект нужен → provision, проект не нужен → adopt", () => {
    expect(single({ coolifyProjectUuid: null }, true)).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "skip",
      reason: "not_ready",
      missing: "provision",
    });
    expect(single({ coolifyProjectUuid: null }, false)).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "adopt",
    });
  });

  it("нет маршрута хостинга → not_ready, не хватает route", () => {
    expect(single({ coolifyAppUuid: null })).toEqual({
      siteId: "s1",
      name: "Shop",
      action: "skip",
      reason: "not_ready",
      missing: "route",
    });
  });

  it("несколько строк — решения в том же порядке", () => {
    const decisions = planAdoption(
      [
        row({ id: "s1" }),
        row({ id: "s2", lifecycle: "ready" }),
        row({ id: "s3", currentRevisionId: null }),
      ],
      true,
    );
    expect(decisions.map((d) => d.siteId)).toEqual(["s1", "s2", "s3"]);
    expect(decisions.map((d) => d.action)).toEqual(["adopt", "skip", "skip"]);
  });
});
