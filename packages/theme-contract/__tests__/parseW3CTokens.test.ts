import { parseW3CTokens } from '../tokens/parseW3CTokens';

describe('parseW3CTokens', () => {
  it('flattens nested groups to dash-joined CSS var keys', () => {
    const input = {
      color: {
        primary: { $value: '#f472b6', $type: 'color' },
        bg: { $value: '#ffffff', $type: 'color' },
      },
      radius: {
        button: { $value: '8px', $type: 'dimension' },
      },
    };
    const result = parseW3CTokens(input);
    expect(result).toEqual({
      '--color-primary': { value: '#f472b6', type: 'color' },
      '--color-bg': { value: '#ffffff', type: 'color' },
      '--radius-button': { value: '8px', type: 'dimension' },
    });
  });

  it('handles deep nesting via dash-join', () => {
    const input = {
      size: {
        hero: {
          heading: { $value: '48px', $type: 'dimension' },
        },
      },
    };
    expect(parseW3CTokens(input)).toEqual({
      '--size-hero-heading': { value: '48px', type: 'dimension' },
    });
  });

  it('ignores groups without $value (intermediate nodes)', () => {
    const input = {
      color: { primary: { $value: '#fff', $type: 'color' } },
    };
    const result = parseW3CTokens(input);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['--color']).toBeUndefined();
  });

  it('accepts tokens without $type', () => {
    const input = { x: { foo: { $value: 'bar' } } };
    expect(parseW3CTokens(input)).toEqual({
      '--x-foo': { value: 'bar', type: undefined },
    });
  });

  it('parses pilot-tokens.json correctly', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const raw = fs.readFileSync(path.join(__dirname, '../tokens/pilot-tokens.json'), 'utf-8');
    const json = JSON.parse(raw);
    const result = parseW3CTokens(json);
    expect(result['--color-primary'].value).toBe('#111111');
    expect(result['--radius-button'].value).toBe('0px');
    expect(result['--size-hero-heading'].value).toBe('48px');
    expect(result['--font-heading'].value).toBe("'Bitter', serif");
  });
});
