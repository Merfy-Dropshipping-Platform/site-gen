/**
 * Решение «можно ли создать магазин» — одно правило данными (этап 3, И2).
 *
 * `decideSiteCreation` — чистая функция: её зовут и старый
 * `BillingClient.canCreateSite` (путь `reserve()`), и команда `CreateStore`.
 * `readEntitlements` — те же права, что `getEntitlements`, плюс признак
 * «биллинг ответил по существу» (`known`): cron «пользователи без магазина»
 * при неизвестном биллинге магазин не создаёт (как и раньше).
 */
import { of, throwError } from "rxjs";
import {
  BillingClient,
  decideSiteCreation,
  type BillingEntitlements,
} from "./billing.client";

const active: BillingEntitlements = {
  shopsLimit: 2,
  staffLimit: 1,
  frozen: false,
  storefrontSuspended: false,
};

describe("decideSiteCreation", () => {
  it("лимит не исчерпан — можно", () => {
    expect(decideSiteCreation(active, 1)).toEqual({ allowed: true, limit: 2 });
  });

  it("лимит исчерпан — shops_limit_reached с limit и current", () => {
    expect(decideSiteCreation(active, 2)).toEqual({
      allowed: false,
      limit: 2,
      reason: "shops_limit_reached",
      details: { limit: 2, current: 2 },
    });
  });

  it("витрина приостановлена (frozen / canceled) — account_frozen раньше лимита", () => {
    expect(
      decideSiteCreation({ ...active, storefrontSuspended: true }, 5),
    ).toMatchObject({ allowed: false, reason: "account_frozen" });
    expect(
      decideSiteCreation(
        { ...active, storefrontSuspended: undefined, status: "canceled" },
        0,
      ),
    ).toMatchObject({ allowed: false, reason: "account_frozen" });
  });

  it("биллинг не ответил: отказ только если так просили, и раньше остальных правил", () => {
    const unknown = { billingKnown: false };
    expect(
      decideSiteCreation(active, 0, {
        ...unknown,
        refuseWhenBillingUnknown: true,
      }),
    ).toEqual({
      allowed: false,
      limit: 2,
      reason: "billing_unavailable",
      details: {},
    });
    expect(decideSiteCreation(active, 0, unknown)).toEqual({
      allowed: true,
      limit: 2,
    });
    expect(
      decideSiteCreation(active, 0, {
        billingKnown: true,
        refuseWhenBillingUnknown: true,
      }),
    ).toEqual({ allowed: true, limit: 2 });
  });
});

describe("BillingClient.readEntitlements: права + «биллинг ответил по существу»", () => {
  const client = (user: unknown, billing: unknown) => {
    const rpc = (answer: unknown) => ({
      send: () =>
        answer instanceof Error ? throwError(() => answer) : of(answer),
    });
    return new BillingClient(rpc(billing) as any, rpc(user) as any);
  };

  it("ответ биллинга — known: true, права как у getEntitlements", async () => {
    const c = client(
      { success: true, accountId: "a" },
      {
        success: true,
        shopsLimit: 3,
        staffLimit: 2,
        frozen: false,
        status: "active",
      },
    );
    const reading = await c.readEntitlements("t1");
    expect(reading.known).toBe(true);
    expect(reading.entitlements).toEqual(await c.getEntitlements("t1"));
    expect(reading.entitlements.shopsLimit).toBe(3);
  });

  it.each([
    [
      "нет аккаунта биллинга",
      { success: false, accountId: null },
      { success: true, shopsLimit: 3 },
    ],
    [
      "RPC биллинга упал",
      { success: true, accountId: "a" },
      new Error("billing down"),
    ],
    [
      "биллинг ответил success:false",
      { success: true, accountId: "a" },
      { success: false, message: "account_not_found" },
    ],
  ])(
    "%s — known: false, права по умолчанию (как getEntitlements)",
    async (_t, user, billing) => {
      const c = client(user, billing);
      const reading = await c.readEntitlements("t1");
      expect(reading.known).toBe(false);
      expect(reading.entitlements).toEqual(await c.getEntitlements("t1"));
    },
  );
});
