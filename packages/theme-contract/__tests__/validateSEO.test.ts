import { validateSEO } from '../validators/validateSEO';

describe('validateSEO', () => {
  it('passes for page with exactly one h1 and all imgs with alt', () => {
    const astro = `
---
const p = Astro.props;
---
<main>
  <h1>Title</h1>
  <img src="x.jpg" alt="image" />
</main>`;
    const r = validateSEO(astro, 'page-root');
    expect(r.ok).toBe(true);
  });

  it('fails when more than one h1 in a page-root context', () => {
    const astro = '<main><h1>A</h1><h1>B</h1></main>';
    const r = validateSEO(astro, 'page-root');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/h1/);
  });

  it('fails when img lacks alt', () => {
    const astro = '<main><h1>X</h1><img src="x.jpg" /></main>';
    const r = validateSEO(astro, 'page-root');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/alt/);
  });

  it('allows empty alt for decorative images', () => {
    const astro = '<main><h1>X</h1><img src="x.jpg" alt="" /></main>';
    const r = validateSEO(astro, 'page-root');
    expect(r.ok).toBe(true);
  });

  it('skips h1 count check in block context (only page-root enforces)', () => {
    const astro = '<section><h2>Sub</h2></section>';
    const r = validateSEO(astro, 'block');
    expect(r.ok).toBe(true);
  });
});
