/**
 * BillingSyncScheduler.reconcileBilling — storefront suspend keying.
 *
 * Guards the CORE of the flip-flop fix: reconcile keys on billing's
 * storefrontSuspended signal (fallback: frozen || status==='canceled'),
 * NOT the raw `frozen` boolean. A regression to `frozen`, or `||` instead of
 * `??`, would resurrect the hourly unfreeze of churned `canceled` storefronts.
 */

// Mock minio before importing — scheduler pulls in SitesDomainService (minio).
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    setBucketPolicy: jest.fn().mockResolvedValue(undefined),
    fPutObject: jest.fn().mockResolvedValue(undefined),
    statObject: jest.fn().mockResolvedValue({ size: 100 }),
    listObjectsV2: jest.fn(),
    removeObjects: jest.fn().mockResolvedValue(undefined),
    removeObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { BillingSyncScheduler } from '../scheduler/billing-sync.scheduler';

describe('BillingSyncScheduler.reconcileBilling — storefront suspend keying', () => {
  // ClientProxy stub: send(pattern).subscribe({next,error,complete}).
  // Delivers asynchronously so the real rpc() helper's `sub` reference is
  // assigned before its complete handler runs.
  const makeRpcClient = (byPattern: Record<string, any>) => ({
    send: (pattern: string) => ({
      subscribe: (obs: any) => {
        Promise.resolve().then(() => {
          obs.next(byPattern[pattern]);
          obs.complete && obs.complete();
        });
        return { unsubscribe() {} };
      },
    }),
  });

  const runReconcile = async (entitlements: any) => {
    const db = {
      select: () => ({
        from: () => ({ where: () => Promise.resolve([{ tenantId: 't1' }]) }),
      }),
    };
    const billingClient = makeRpcClient({ 'billing.get_entitlements': entitlements });
    const userClient = makeRpcClient({
      'user.get_tenant_billing_account': { accountId: 'acc-1' },
    });
    const sites = {
      freezeTenant: jest.fn().mockResolvedValue({ affected: 1 }),
      unfreezeTenant: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const scheduler = new BillingSyncScheduler(
      db as any,
      billingClient as any,
      userClient as any,
      sites as any,
      {} as any,
      {} as any,
    );
    // Isolate suspend keying from the post-loop static-content pass.
    jest
      .spyOn(scheduler as any, 'ensureStaticContent')
      .mockResolvedValue(undefined);
    await scheduler.reconcileBilling();
    return sites;
  };

  it('canceled → freeze (billing storefrontSuspended=true)', async () => {
    const sites = await runReconcile({
      success: true,
      storefrontSuspended: true,
      status: 'canceled',
      frozen: false,
    });
    expect(sites.freezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });

  it('canceled → freeze via fallback (storefrontSuspended undefined, kills hourly flip-flop)', async () => {
    const sites = await runReconcile({
      success: true,
      status: 'canceled',
      frozen: false,
    });
    expect(sites.freezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });

  it('past_due → unfreeze (NOT suspended: storefront live through dunning)', async () => {
    const sites = await runReconcile({
      success: true,
      status: 'past_due',
      frozen: false,
    });
    expect(sites.unfreezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
  });

  it('active → unfreeze (live)', async () => {
    const sites = await runReconcile({
      success: true,
      status: 'active',
      frozen: false,
      storefrontSuspended: false,
    });
    expect(sites.unfreezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
  });

  it('hard-frozen debtor → freeze (real freeze/purge lifecycle intact)', async () => {
    const sites = await runReconcile({
      success: true,
      status: 'frozen',
      frozen: true,
      storefrontSuspended: true,
    });
    expect(sites.freezeTenant).toHaveBeenCalledWith('t1');
  });

  it('honors explicit storefrontSuspended=false over the status fallback (?? not ||)', async () => {
    // Adversarial: billing explicitly says not-suspended, yet status is canceled.
    // `?? ` must respect the explicit false -> unfreeze. `||` would wrongly freeze.
    const sites = await runReconcile({
      success: true,
      storefrontSuspended: false,
      status: 'canceled',
      frozen: false,
    });
    expect(sites.unfreezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
  });
});
