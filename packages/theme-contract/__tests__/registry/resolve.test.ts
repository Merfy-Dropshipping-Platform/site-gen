import { resolveImports } from '../../registry/resolve';

describe('resolveImports', () => {
  const opts = { pkg: 'theme-base', blockName: 'Hero', mode: 'flat' as const };

  it('rewrites sibling ./X to flat naming', () => {
    const src = `import { Foo } from './HeroFoo';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toContain(`from './theme-base__Hero__HeroFoo.mjs'`);
    expect(out.deps).toContain('theme-base__Hero__HeroFoo.mjs');
  });

  it('rewrites .ts extension', () => {
    const src = `import { Bar } from './HeroBar.ts';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toContain(`from './theme-base__Hero__HeroBar.mjs'`);
  });

  it('rewrites ../../runtime/X to flat runtime__X.mjs', () => {
    const src = `import { X } from '../../runtime/placeholders';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toContain(`from './runtime__placeholders.mjs'`);
    expect(out.deps).toContain('runtime__placeholders.mjs');
  });

  it('leaves package imports untouched', () => {
    const src = `import { z } from 'zod';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toBe(src);
    expect(out.deps).toHaveLength(0);
  });

  it('handles .astro sibling imports (block context)', () => {
    const src = `import Other from './HeroOther.astro';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toContain(`from './theme-base__Hero__HeroOther.mjs'`);
  });

  it('handles .astro sibling imports (layouts/seo category)', () => {
    const src = `import Base from './BaseLayout.astro';`;
    const out = resolveImports(src, { pkg: 'theme-base', blockName: 'layouts__StoreLayout', mode: 'flat' });
    expect(out.rewritten).toContain(`from './theme-base__layouts__BaseLayout.mjs'`);
  });

  it('does not touch .json/.css/.mjs imports', () => {
    const src = `import data from './data.json';\nimport './styles.css';\nimport './x.mjs';`;
    const out = resolveImports(src, opts);
    expect(out.rewritten).toBe(src);
  });

  it('tree mode leaves imports unchanged', () => {
    const src = `import { X } from './Y';`;
    const out = resolveImports(src, { ...opts, mode: 'tree' });
    expect(out.rewritten).toBe(src);
    expect(out.deps).toHaveLength(0);
  });
});
