/**
 * checkSiteAvailability — billing gate keys on storefrontSuspended.
 *
 * This is the owner-facing diagnostic (GET /sites/:id/availability). It must
 * report a terminal `canceled` subscription as unavailable (reason
 * account_frozen) regardless of whether reconcile has flipped site.status to
 * frozen yet — closing the report window where a churned storefront read as
 * available. past_due / active stay available (live through dunning).
 */

// Mock minio before importing SitesDomainService (pulls it in).
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

import { SitesDomainService } from '../sites.service';

describe('SitesDomainService.checkSiteAvailability — storefront-suspend gate', () => {
  // Only db + billingClient are exercised by checkSiteAvailability.
  const run = async (
    site: { status: string; publicUrl?: string | null; coolifyAppUuid?: string | null },
    entitlements: any,
  ) => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 's1',
                  status: site.status,
                  publicUrl: site.publicUrl ?? 'https://s1.merfy.ru',
                  coolifyAppUuid:
                    site.coolifyAppUuid === undefined ? 'app-1' : site.coolifyAppUuid,
                },
              ]),
          }),
        }),
      }),
    };
    const billingClient = { getEntitlements: jest.fn().mockResolvedValue(entitlements) };
    const service = new SitesDomainService(
      db as any,
      {} as any, // coolifyClient
      {} as any, // generator
      {} as any, // events
      {} as any, // deployments
      {} as any, // storage
      {} as any, // domainClient
      billingClient as any,
      {} as any, // buildQueue
    );
    return service.checkSiteAvailability('t1', 's1');
  };

  it('canceled, pre-freeze (site still published) → unavailable, reason account_frozen (WINDOW CLOSED)', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: true, frozen: false, status: 'canceled' },
    );
    expect(r.billingAllowed).toBe(false);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('account_frozen');
  });

  it('canceled via fallback (storefrontSuspended undefined) → unavailable', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, frozen: false, status: 'canceled' },
    );
    expect(r.billingAllowed).toBe(false);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('account_frozen');
  });

  it('past_due → billingAllowed, available (storefront live through dunning)', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: false, frozen: false, status: 'past_due' },
    );
    expect(r.billingAllowed).toBe(true);
    expect(r.available).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('active → available', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: false, frozen: false, status: 'active' },
    );
    expect(r.billingAllowed).toBe(true);
    expect(r.available).toBe(true);
  });

  it('real frozen debtor → unavailable, account_frozen (unchanged)', async () => {
    const r = await run(
      { status: 'frozen', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: true, frozen: true, status: 'frozen' },
    );
    expect(r.billingAllowed).toBe(false);
    expect(r.reason).toBe('account_frozen');
    expect(r.available).toBe(false);
  });

  it('billing outage / default entitlements → billingAllowed (availability-first)', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { shopsLimit: 1, staffLimit: 1, frozen: false, storefrontSuspended: false },
    );
    expect(r.billingAllowed).toBe(true);
    expect(r.available).toBe(true);
  });

  it('honors explicit storefrontSuspended=false over status=canceled (?? not ||)', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: false, frozen: false, status: 'canceled' },
    );
    expect(r.billingAllowed).toBe(true);
    expect(r.available).toBe(true);
  });

  it('preserves response shape (keys unchanged)', async () => {
    const r = await run(
      { status: 'published', coolifyAppUuid: 'app-1' },
      { success: true, storefrontSuspended: false, frozen: false, status: 'active' },
    );
    expect(typeof r.available).toBe('boolean');
    expect(r).toHaveProperty('billingAllowed');
    expect(r).toHaveProperty('isPublished');
    expect(r).toHaveProperty('isDeployed');
    expect(r).toHaveProperty('publicUrl');
    expect(r).toHaveProperty('exists', true);
  });
});
