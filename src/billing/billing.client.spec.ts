import { of, throwError } from "rxjs";
import { BillingClient } from "./billing.client";

interface SendCall {
  pattern: string;
  payload: unknown;
}

const makeClient = (
  responder: (pattern: string, payload: unknown) => unknown,
  calls: SendCall[],
) =>
  ({
    send: (pattern: string, payload: unknown) => {
      calls.push({ pattern, payload });
      const result = responder(pattern, payload);
      if (result instanceof Error) {
        return throwError(() => result);
      }
      return of(result);
    },
  }) as any;

describe("BillingClient", () => {
  describe("getEntitlements", () => {
    it("resolves accountId via user RPC, then queries billing with that accountId", async () => {
      const calls: SendCall[] = [];
      const tenantId = "tenant-uuid";
      const accountId = "admin-user-uuid";

      const userClient = makeClient((pattern) => {
        if (pattern === "user.get_tenant_billing_account") {
          return { success: true, accountId };
        }
        return undefined;
      }, calls);

      const billingClient = makeClient((pattern) => {
        if (pattern === "billing.get_entitlements") {
          return {
            success: true,
            shopsLimit: 5,
            staffLimit: 3,
            frozen: false,
            planName: "standard",
            status: "active",
          };
        }
        return undefined;
      }, calls);

      const client = new BillingClient(billingClient, userClient);
      const result = await client.getEntitlements(tenantId);

      expect(calls).toEqual([
        {
          pattern: "user.get_tenant_billing_account",
          payload: { tenantId },
        },
        {
          pattern: "billing.get_entitlements",
          payload: { accountId },
        },
      ]);
      expect(result).toEqual({
        shopsLimit: 5,
        staffLimit: 3,
        frozen: false,
        planName: "standard",
        status: "active",
      });
    });

    it("falls back to defaults when user service has no billing account", async () => {
      const calls: SendCall[] = [];

      const userClient = makeClient(
        () => ({ success: false, accountId: null }),
        calls,
      );
      const billingClient = makeClient(() => undefined, calls);

      const client = new BillingClient(billingClient, userClient);
      const result = await client.getEntitlements("tenant-uuid");

      expect(calls.map((c) => c.pattern)).toEqual([
        "user.get_tenant_billing_account",
      ]);
      expect(result).toEqual({
        shopsLimit: 1,
        staffLimit: 1,
        frozen: false,
      });
    });

    it("falls back to defaults when billing RPC fails", async () => {
      const calls: SendCall[] = [];
      const accountId = "admin-user-uuid";

      const userClient = makeClient(
        () => ({ success: true, accountId }),
        calls,
      );
      const billingClient = makeClient(
        () => new Error("billing unavailable"),
        calls,
      );

      const client = new BillingClient(billingClient, userClient);
      const result = await client.getEntitlements("tenant-uuid");

      expect(calls.map((c) => c.pattern)).toEqual([
        "user.get_tenant_billing_account",
        "billing.get_entitlements",
      ]);
      expect(result).toEqual({
        shopsLimit: 1,
        staffLimit: 1,
        frozen: false,
      });
    });
  });

  describe("canCreateSite", () => {
    it("blocks with shops_limit_reached when count >= shopsLimit", async () => {
      const userClient = makeClient(
        () => ({ success: true, accountId: "a" }),
        [],
      );
      const billingClient = makeClient(
        () => ({
          success: true,
          shopsLimit: 1,
          staffLimit: 1,
          frozen: false,
        }),
        [],
      );
      const client = new BillingClient(billingClient, userClient);

      await expect(client.canCreateSite("t", 1)).resolves.toEqual({
        allowed: false,
        limit: 1,
        reason: "shops_limit_reached",
      });
    });

    it("allows when count < shopsLimit and not frozen", async () => {
      const userClient = makeClient(
        () => ({ success: true, accountId: "a" }),
        [],
      );
      const billingClient = makeClient(
        () => ({
          success: true,
          shopsLimit: 5,
          staffLimit: 3,
          frozen: false,
        }),
        [],
      );
      const client = new BillingClient(billingClient, userClient);

      await expect(client.canCreateSite("t", 1)).resolves.toEqual({
        allowed: true,
        limit: 5,
      });
    });

    it("blocks with account_frozen when frozen=true", async () => {
      const userClient = makeClient(
        () => ({ success: true, accountId: "a" }),
        [],
      );
      const billingClient = makeClient(
        () => ({
          success: true,
          shopsLimit: 5,
          staffLimit: 3,
          frozen: true,
        }),
        [],
      );
      const client = new BillingClient(billingClient, userClient);

      await expect(client.canCreateSite("t", 1)).resolves.toEqual({
        allowed: false,
        limit: 5,
        reason: "account_frozen",
      });
    });
  });
});
