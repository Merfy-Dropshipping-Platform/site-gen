import { planRewrites, type RevisionRow } from '../themes/backfill-planner';
import { LEGACY_SEED_SCHEMES } from '../themes/legacy-seed-schemes';

function row(
  id: string,
  theme: string | null,
  colorSchemes: unknown,
): RevisionRow {
  return {
    id,
    siteThemeId: theme,
    data: { themeSettings: { colorSchemes } },
  };
}

describe('planRewrites', () => {
  it('rewrites when schemes deep-equal LEGACY_SEED_SCHEMES and theme is known', () => {
    const plans = planRewrites([
      row('rev-1', 'rose', JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES))),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].action).toBe('rewrite');
    expect(plans[0].themeId).toBe('rose');
    expect(plans[0].newSchemes?.[0].id).toBe('scheme-1');
    expect(plans[0].newSchemes?.[0].background.toLowerCase()).toBe('#ffffff');
  });

  it('skips when schemes differ from legacy (customised)', () => {
    const custom = JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES));
    custom[0].background = '#AABBCC';
    const plans = planRewrites([row('rev-2', 'rose', custom)]);
    expect(plans[0].action).toBe('skip-customised');
    expect(plans[0].newSchemes).toBeUndefined();
  });

  it('skips when site has no theme id', () => {
    const plans = planRewrites([row('rev-3', null, LEGACY_SEED_SCHEMES)]);
    expect(plans[0].action).toBe('skip-no-theme');
  });

  it('skips when themeSettings has no schemes', () => {
    const plans = planRewrites([row('rev-4', 'rose', undefined)]);
    expect(plans[0].action).toBe('skip-no-schemes');
  });

  it('skips when theme has no manifest schemes to seed from', () => {
    // unknown theme => converter returns []
    const plans = planRewrites([
      row('rev-5', 'unknown-theme', JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES))),
    ]);
    expect(plans[0].action).toBe('skip-no-theme-schemes');
  });

  it('processes a batch with mixed outcomes', () => {
    const plans = planRewrites([
      row('a', 'rose', JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES))),
      row('b', null, LEGACY_SEED_SCHEMES),
      row('c', 'vanilla', [{ id: 'scheme-1', background: '#CUSTOM' }]),
      row('d', 'bloom', JSON.parse(JSON.stringify(LEGACY_SEED_SCHEMES))),
    ]);
    expect(plans.map((p) => p.action)).toEqual([
      'rewrite',
      'skip-no-theme',
      'skip-customised',
      'rewrite',
    ]);
  });
});
