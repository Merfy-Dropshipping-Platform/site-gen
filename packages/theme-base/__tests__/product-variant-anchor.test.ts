/**
 * Product variant deep-link anchor — pure parse/serialize logic test.
 *
 * Production behavior: Product.astro auto-selects a variant from `?opt.*` on
 * load (parseVariantAnchor) and writes the current selection back to the URL on
 * every variant pick (writeVariantAnchorToSearch → history.replaceState). This
 * unit-tests the pure, DOM-free helper extracted to blocks/Product/variantAnchor.ts,
 * which is also the oracle the inline mirror is asserted against (DOM test).
 */
import {
  VARIANT_ANCHOR_PREFIX,
  parseVariantAnchor,
  serializeVariantAnchor,
  writeVariantAnchorToSearch,
} from '../blocks/Product/variantAnchor';

describe('serializeVariantAnchor / parseVariantAnchor — round-trip', () => {
  it('empty selection → empty string, and back to {}', () => {
    expect(serializeVariantAnchor({})).toBe('');
    expect(parseVariantAnchor('')).toEqual({});
    expect(parseVariantAnchor('?')).toEqual({});
  });

  it('uses the opt. namespace prefix', () => {
    expect(VARIANT_ANCHOR_PREFIX).toBe('opt.');
    const qs = serializeVariantAnchor({ Цвет: 'Белый' });
    expect(new URLSearchParams(qs).has('opt.Цвет')).toBe(true);
  });

  it('round-trips a single Cyrillic axis exactly', () => {
    const sel = { Цвет: 'Белый' };
    expect(parseVariantAnchor(serializeVariantAnchor(sel))).toEqual(sel);
  });

  it('round-trips multiple axes exactly', () => {
    const sel = { Цвет: 'Белый', Размер: 'M' };
    expect(parseVariantAnchor(serializeVariantAnchor(sel))).toEqual(sel);
  });

  it('round-trips values with special chars : ; = & /', () => {
    const sel = { Материал: 'хлопок/лён:100;мода=да&нет' };
    const qs = serializeVariantAnchor(sel);
    // Special chars are percent-encoded in the wire form (not left raw).
    expect(qs).not.toContain('&нет=');
    expect(parseVariantAnchor(qs)).toEqual(sel);
  });

  it('round-trips an axis NAME containing special chars', () => {
    const sel = { 'Раз=мер': 'M&L' };
    expect(parseVariantAnchor(serializeVariantAnchor(sel))).toEqual(sel);
  });

  it('accepts search with or without a leading ?', () => {
    expect(parseVariantAnchor('opt.Цвет=Белый')).toEqual({ Цвет: 'Белый' });
    expect(parseVariantAnchor('?opt.Цвет=Белый')).toEqual({ Цвет: 'Белый' });
  });
});

describe('parseVariantAnchor — soft / collision-safe', () => {
  it('ignores non-opt params (id, collection, filters) — no collision', () => {
    const qs = 'id=abc123&collection=URBAN&color=red,blue&page=2&opt.Цвет=Синий';
    expect(parseVariantAnchor(qs)).toEqual({ Цвет: 'Синий' });
  });

  it('reads only the axes present (partial selection is fine)', () => {
    expect(parseVariantAnchor('opt.Цвет=Белый')).toEqual({ Цвет: 'Белый' });
  });

  it('drops empty axis name (bare prefix) and empty value', () => {
    expect(parseVariantAnchor('opt.=X&opt.Цвет=')).toEqual({});
  });

  it('does not treat a lookalike param as an axis', () => {
    // Only the exact "opt." prefix qualifies; "option"/"opt" alone do not.
    expect(parseVariantAnchor('option=X&opt=Y&optical=Z')).toEqual({});
  });
});

describe('writeVariantAnchorToSearch — merge / preserve / replace', () => {
  it('preserves foreign params and appends axes (collision-safe)', () => {
    const out = writeVariantAnchorToSearch('id=abc&collection=URBAN', { Цвет: 'Синий' });
    const p = new URLSearchParams(out);
    expect(p.get('id')).toBe('abc');
    expect(p.get('collection')).toBe('URBAN');
    expect(p.get('opt.Цвет')).toBe('Синий');
  });

  it('replaces stale axis params instead of duplicating them', () => {
    const out = writeVariantAnchorToSearch('ref=keep&opt.Цвет=Белый', { Цвет: 'Синий' });
    const p = new URLSearchParams(out);
    expect(p.getAll('opt.Цвет')).toEqual(['Синий']); // exactly one, updated
    expect(p.get('ref')).toBe('keep');
  });

  it('clears axes when selection is empty but keeps foreign params', () => {
    const out = writeVariantAnchorToSearch('ref=keep&opt.Цвет=Белый&opt.Размер=M', {});
    const p = new URLSearchParams(out);
    expect(p.has('opt.Цвет')).toBe(false);
    expect(p.has('opt.Размер')).toBe(false);
    expect(p.get('ref')).toBe('keep');
  });

  it('drops empty axis name / value on write', () => {
    const out = writeVariantAnchorToSearch('', { '': 'X', Цвет: '' });
    expect(out).toBe('');
  });

  it('full write→parse round-trip alongside foreign params', () => {
    const sel = { Цвет: 'Синий', Размер: 'M' };
    const out = writeVariantAnchorToSearch('id=abc', sel);
    expect(parseVariantAnchor(out)).toEqual(sel);
  });
});
