/**
 * BillingEventsConsumer — storefront suspend transition matrix.
 *
 * Guards the suspend-status set {frozen, canceled} (past_due intentionally
 * excluded) that mirrors billing.storefrontSuspended. A regression that put
 * `past_due` back into the set (or dropped `canceled`) would flip storefront
 * suspend behavior; these transitions pin it.
 */

// Mock minio before importing — the consumer pulls in SitesDomainService which
// imports minio (ipaddr.js moduleNameMapper issue). Same as freeze-unfreeze.spec.
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

import { BillingEventsConsumer } from '../billing/billing-events.consumer';

describe('BillingEventsConsumer.handleSubscriptionUpdated — storefront suspend matrix', () => {
  const makeConsumer = () => {
    const sites = {
      freezeTenant: jest.fn().mockResolvedValue({ affected: 1 }),
      unfreezeTenant: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    // (configService, userClient, sites). tenantId is passed in the payload,
    // so userClient/configService are never touched here.
    const consumer = new BillingEventsConsumer({} as any, {} as any, sites as any);
    return { consumer, sites };
  };

  // handleSubscriptionUpdated is private; invoke via cast.
  const handle = (consumer: any, status: string, previousStatus: string) =>
    consumer.handleSubscriptionUpdated({ tenantId: 't1', status, previousStatus });

  it('trialing → canceled: freezes (churned no-card trial)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'canceled', 'trialing');
    expect(sites.freezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });

  it('active → past_due: no freeze/unfreeze (storefront stays live through dunning)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'past_due', 'active');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });

  it('past_due → canceled: freezes (cancel after dunning)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'canceled', 'past_due');
    expect(sites.freezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });

  it('frozen → active: unfreezes (recovery)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'active', 'frozen');
    expect(sites.unfreezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
  });

  it('canceled → active: unfreezes (reactivation via upgrade)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'active', 'canceled');
    expect(sites.unfreezeTenant).toHaveBeenCalledWith('t1');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
  });

  it('frozen → canceled: no-op (both suspended)', async () => {
    const { consumer, sites } = makeConsumer();
    await handle(consumer, 'canceled', 'frozen');
    expect(sites.freezeTenant).not.toHaveBeenCalled();
    expect(sites.unfreezeTenant).not.toHaveBeenCalled();
  });
});
