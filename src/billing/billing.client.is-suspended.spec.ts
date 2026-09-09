import { isStorefrontSuspended } from './billing.client';

// Pure predicate shared by billing-sync reconcile AND checkSiteAvailability.
// Guards the {frozen, canceled} suspend set + the `??` (not `||`) semantics.
describe('isStorefrontSuspended', () => {
  it('canceled with explicit signal → suspended', () => {
    expect(
      isStorefrontSuspended({ storefrontSuspended: true, frozen: false, status: 'canceled' }),
    ).toBe(true);
  });

  it('canceled via fallback (signal undefined, old billing) → suspended', () => {
    expect(isStorefrontSuspended({ frozen: false, status: 'canceled' })).toBe(true);
  });

  it('past_due → NOT suspended (live through dunning)', () => {
    expect(isStorefrontSuspended({ storefrontSuspended: false, frozen: false, status: 'past_due' })).toBe(false);
    // fallback form:
    expect(isStorefrontSuspended({ frozen: false, status: 'past_due' })).toBe(false);
  });

  it('active / trialing → NOT suspended', () => {
    expect(isStorefrontSuspended({ frozen: false, status: 'active' })).toBe(false);
    expect(isStorefrontSuspended({ frozen: false, status: 'trialing' })).toBe(false);
  });

  it('real frozen debtor → suspended', () => {
    expect(isStorefrontSuspended({ storefrontSuspended: true, frozen: true, status: 'frozen' })).toBe(true);
    expect(isStorefrontSuspended({ frozen: true, status: 'frozen' })).toBe(true);
  });

  it('honors explicit storefrontSuspended=false over the status fallback (?? not ||)', () => {
    expect(
      isStorefrontSuspended({ storefrontSuspended: false, frozen: false, status: 'canceled' }),
    ).toBe(false);
  });

  it('outage/default (suspended:false) and orphan (all undefined) → NOT suspended (availability-first)', () => {
    expect(isStorefrontSuspended({ storefrontSuspended: false, frozen: false })).toBe(false);
    expect(isStorefrontSuspended({ frozen: false })).toBe(false);
  });
});
