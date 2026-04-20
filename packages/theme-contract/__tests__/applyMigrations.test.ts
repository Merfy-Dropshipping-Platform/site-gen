import { applyMigrations } from '../resolver/applyMigrations';

describe('applyMigrations', () => {
  const roseData = [
    { type: 'Hero', props: { id: 'h1', image: 'rose.jpg', title: 'Welcome' } },
    { type: 'Footer', props: { id: 'f1', copyright: 'Rose Inc' } },
  ];

  const satinMigrations = {
    Hero: {
      from: { rose: { image: 'imageLeft' }, '*': { image: 'imageLeft' } },
    },
  };

  const satinDefaults = {
    Hero:   { title: '', imageLeft: '', imageRight: '' },
    Footer: { copyright: '' },
  };

  it('remaps fields according to rule', () => {
    const r = applyMigrations(roseData, { fromTheme: 'rose', migrations: satinMigrations, defaults: satinDefaults });
    const hero = r.migrated.find(b => b.type === 'Hero')!;
    expect(hero.props.imageLeft).toBe('rose.jpg');
    expect(hero.props.title).toBe('Welcome');
    expect(hero.props.image).toBeUndefined();
  });

  it('fills unmapped fields with defaults', () => {
    const r = applyMigrations(roseData, { fromTheme: 'rose', migrations: satinMigrations, defaults: satinDefaults });
    const hero = r.migrated.find(b => b.type === 'Hero')!;
    expect(hero.props.imageRight).toBe('');
  });

  it('passes blocks without migration rules through unchanged', () => {
    const r = applyMigrations(roseData, { fromTheme: 'rose', migrations: satinMigrations, defaults: satinDefaults });
    const footer = r.migrated.find(b => b.type === 'Footer')!;
    expect(footer.props.copyright).toBe('Rose Inc');
  });

  it('produces a report of migrated and reset fields', () => {
    const r = applyMigrations(roseData, { fromTheme: 'rose', migrations: satinMigrations, defaults: satinDefaults });
    expect(r.report.migrated.length).toBeGreaterThan(0);
    expect(r.report.reset.some(x => x.field === 'imageRight')).toBe(true);
  });

  it('uses wildcard rule when fromTheme-specific rule missing', () => {
    const rule = { Hero: { from: { '*': { image: 'imageLeft' } } } };
    const r = applyMigrations(roseData, { fromTheme: 'unknown-theme', migrations: rule, defaults: satinDefaults });
    const hero = r.migrated.find(b => b.type === 'Hero')!;
    expect(hero.props.imageLeft).toBe('rose.jpg');
  });
});
