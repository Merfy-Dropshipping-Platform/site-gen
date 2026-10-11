import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/color';
import { contrastIssues } from '../src/contrast';
import { resolveTokens } from '../src/resolve';
import { pink, sample } from './support';

const asText = (issues: ReturnType<typeof contrastIssues>) =>
  issues.map((issue) => `${issue.scheme} ${issue.text}/${issue.on} ${issue.ratio.toFixed(2)}`);

describe('читаемость', () => {
  // Серый — 70 % цвета текста и 30 % фона (design.md блока 9, Т9-4 А). При 60 % образец проходил впритык — 4,54, а
  // мягкие фоны трёх видов блока 9 — нет.
  it('у образца проблем нет; серый на приглушённом — 6,53', () => {
    const resolved = resolveTokens(sample.dictionary, sample.tokens, {});
    expect(contrastIssues(sample.dictionary, resolved)).toEqual([]);
    const colors = resolved.schemes['scheme-1'];
    expect([colors['muted-foreground'], colors.muted]).toEqual(['#585858', '#f5f5f5']);
    expect(contrastRatio('#585858', '#f5f5f5').toFixed(2)).toBe('6.53');
  });

  it('серый — 70 % цвета текста в фоне в каждой схеме; старая цена — тот же серый', () => {
    const resolved = resolveTokens(sample.dictionary, sample.tokens, {});
    const light = resolved.schemes['scheme-1'];
    const dark = resolved.schemes['scheme-2'];
    expect([light['muted-foreground'], light['price-old']]).toEqual(['#585858', '#585858']);
    expect([dark['muted-foreground'], dark['price-old']]).toEqual(['#b1b1b1', '#b1b1b1']);
  });

  it('розовая схема: ниже 4,5 только белая надпись на розовой кнопке — её задала тема', () => {
    const resolved = resolveTokens(pink.dictionary, pink.tokens, {});
    expect(asText(contrastIssues(pink.dictionary, resolved))).toEqual(['scheme-1 primary-foreground/primary 4.18']);
  });

  it('пару без цвета пропускает', () => {
    const resolved = { root: {}, schemes: { 'scheme-1': { primary: '#111111' } } };
    expect(contrastIssues(sample.dictionary, resolved)).toEqual([]);
  });
});
