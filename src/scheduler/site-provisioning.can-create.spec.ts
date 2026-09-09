/**
 * SiteProvisioningScheduler.canCreateSite — storefront-suspend gate.
 *
 * The auto-provision gate previously keyed on raw `frozen`, so a terminal
 * `canceled` (frozen=false) got a default site provisioned. It now keys on
 * isStorefrontSuspended ({frozen, canceled}) — but the `!success` guard MUST
 * stay first so unknown billing is refused before the suspend check.
 */

// Mock minio before importing (the scheduler pulls in SitesDomainService).
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

import { SiteProvisioningScheduler } from './site-provisioning.scheduler';

describe('SiteProvisioningScheduler.canCreateSite — storefront-suspend gate', () => {
  // canCreateSite is private and pure (reads only its argument).
  const gate = (e: any): boolean => {
    const scheduler = new SiteProvisioningScheduler(
      {} as any, // billingClient
      {} as any, // userClient
      {} as any, // sites
    );
    return (scheduler as any).canCreateSite(e);
  };

  it('blocks canceled (storefrontSuspended signal, frozen=false)', () => {
    expect(
      gate({ success: true, shopsLimit: 5, frozen: false, storefrontSuspended: true, status: 'canceled' }),
    ).toBe(false);
  });

  it('blocks canceled via fallback (no storefrontSuspended, status=canceled)', () => {
    expect(gate({ success: true, shopsLimit: 5, frozen: false, status: 'canceled' })).toBe(false);
  });

  it('allows active / trialing / past_due (not suspended)', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(
        gate({ success: true, shopsLimit: 5, frozen: false, storefrontSuspended: false, status }),
      ).toBe(true);
    }
  });

  it('blocks a real frozen debtor', () => {
    expect(
      gate({ success: true, shopsLimit: 5, frozen: true, storefrontSuspended: true, status: 'frozen' }),
    ).toBe(false);
  });

  it('refuses unknown billing {success:false} via the success guard FIRST (before the suspend check)', () => {
    // Load-bearing ordering: isStorefrontSuspended({success:false}) would be
    // false (all fields undefined) → would wrongly allow if the success guard
    // did not short-circuit first.
    expect(gate({ success: false })).toBe(false);
  });

  it('respects shopsLimit boundary (0 blocks; null/undefined allow)', () => {
    const base = { success: true, frozen: false, storefrontSuspended: false, status: 'active' };
    expect(gate({ ...base, shopsLimit: 0 })).toBe(false);
    expect(gate({ ...base, shopsLimit: null })).toBe(true);
    expect(gate({ ...base })).toBe(true); // shopsLimit undefined
  });
});
