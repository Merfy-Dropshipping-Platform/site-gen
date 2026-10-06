import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/color';
import { contrastIssues } from '../src/contrast';
import { resolveTokens } from '../src/resolve';
import { pink, sample } from './support';

const asText = (issues: ReturnType<typeof contrastIssues>) =>
  issues.map((issue) => `${issue.scheme} ${issue.text}/${issue.on} ${issue.ratio.toFixed(2)}`);

describe('читаемость', () => {
  it('у образца проблем нет; самая слабая пара — 4,54', () => {
    const resolved = resolveTokens(sample.dictionary, sample.tokens, {});
    expect(contrastIssues(sample.dictionary, resolved)).toEqual([]);
    const colors = resolved.schemes['scheme-1'];
    expect([colors['muted-foreground'], colors.muted]).toEqual(['#707070', '#f5f5f5']);
    expect(contrastRatio('#707070', '#f5f5f5').toFixed(2)).toBe('4.54');
  });

  it('розовая схема: четыре пары ниже 4,5 — по порядку расчёта', () => {
    const resolved = resolveTokens(pink.dictionary, pink.tokens, {});
    expect(asText(contrastIssues(pink.dictionary, resolved))).toEqual([
      'scheme-1 primary-foreground/primary 4.18',
      'scheme-1 muted-foreground/background 4.24',
      'scheme-1 muted-foreground/muted 3.93',
      'scheme-1 price-old/background 4.24',
    ]);
  });

  it('пару без цвета пропускает', () => {
    const resolved = { root: {}, schemes: { 'scheme-1': { primary: '#111111' } } };
    expect(contrastIssues(sample.dictionary, resolved)).toEqual([]);
  });
});
