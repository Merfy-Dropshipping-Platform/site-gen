/**
 * Гейт автосоздания магазина для cron «пользователи без магазина» —
 * storefront-suspend и «неизвестный биллинг».
 *
 * ИЗМЕНЕНО ОСОЗНАННО (этап 3, кусок 3.2): гейт переехал из приватного
 * `SiteProvisioningScheduler.canCreateSite` в правила команды `CreateStore`
 * (источник `missing-store`, `decideSiteCreation` + `readEntitlements`) — cron
 * больше не проверяет лимит сам, лимит решает команда один раз.
 * БЫЛО — вход: сырой ответ `billing.get_entitlements`, выход: boolean.
 * СТАЛО — тот же сырой ответ идёт через `BillingClient.readEntitlements` и
 * правила команды. Случаи и исходы — те же шесть:
 *   - canceled (storefrontSuspended) — отказ;
 *   - canceled по fallback (status) — отказ;
 *   - active / trialing / past_due — можно;
 *   - замороженный должник — отказ;
 *   - неизвестный биллинг {success:false} — отказ, и РАНЬШЕ проверки заморозки;
 *   - лимит 0 — отказ; null/undefined — можно (у тенанта без магазина).
 */
import { of } from "rxjs";
import { BillingClient, decideSiteCreation } from "../billing/billing.client";
import { REFUSE_WHEN_BILLING_UNKNOWN } from "../store/commands/create-store.command";

/** Гейт cron: сырой ответ биллинга → решение команды для источника `missing-store`. */
async function gate(rawBillingAnswer: unknown): Promise<boolean> {
  const rpc = (answer: unknown) => ({ send: () => of(answer) });
  const client = new BillingClient(
    rpc(rawBillingAnswer) as any,
    rpc({ success: true, accountId: "acc-1" }) as any,
  );
  const reading = await client.readEntitlements("t1");
  // cron создаёт магазин только тенанту без магазинов: текущих — 0.
  return decideSiteCreation(reading.entitlements, 0, {
    billingKnown: reading.known,
    refuseWhenBillingUnknown: REFUSE_WHEN_BILLING_UNKNOWN["missing-store"],
  }).allowed;
}

describe("автосоздание магазина cron «без магазина» — гейт в правилах CreateStore", () => {
  it("источник missing-store отказывает при неизвестном биллинге", () => {
    expect(REFUSE_WHEN_BILLING_UNKNOWN["missing-store"]).toBe(true);
  });

  it("blocks canceled (storefrontSuspended signal, frozen=false)", async () => {
    expect(
      await gate({
        success: true,
        shopsLimit: 5,
        frozen: false,
        storefrontSuspended: true,
        status: "canceled",
      }),
    ).toBe(false);
  });

  it("blocks canceled via fallback (no storefrontSuspended, status=canceled)", async () => {
    expect(
      await gate({
        success: true,
        shopsLimit: 5,
        frozen: false,
        status: "canceled",
      }),
    ).toBe(false);
  });

  it("allows active / trialing / past_due (not suspended)", async () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(
        await gate({
          success: true,
          shopsLimit: 5,
          frozen: false,
          storefrontSuspended: false,
          status,
        }),
      ).toBe(true);
    }
  });

  it("blocks a real frozen debtor", async () => {
    expect(
      await gate({
        success: true,
        shopsLimit: 5,
        frozen: true,
        storefrontSuspended: true,
        status: "frozen",
      }),
    ).toBe(false);
  });

  it("refuses unknown billing {success:false} FIRST (before the suspend check)", async () => {
    // Без правила «неизвестный биллинг» права по умолчанию читались бы как
    // «не заморожен, лимит 1» — и магазин создался бы.
    expect(await gate({ success: false })).toBe(false);
  });

  it("respects shopsLimit boundary (0 blocks; null/undefined allow)", async () => {
    const base = {
      success: true,
      frozen: false,
      storefrontSuspended: false,
      status: "active",
    };
    expect(await gate({ ...base, shopsLimit: 0 })).toBe(false);
    expect(await gate({ ...base, shopsLimit: null })).toBe(true);
    expect(await gate({ ...base })).toBe(true); // shopsLimit undefined
  });
});
