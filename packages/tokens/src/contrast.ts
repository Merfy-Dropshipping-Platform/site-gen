import { READABLE, contrastRatio } from './color';
import { namesIn } from './dictionary';
import type { ContrastIssue, Dictionary, ResolvedTokens, TokenSet } from './types';

// Читаемость (design.md, раздел 6): пары «текст на фоне» из поля on, у которых контраст ниже 4,5.
// Порядок — схемы темы, внутри схемы — порядок расчёта словаря.

function pairIssues(scheme: string, colors: Readonly<TokenSet>, text: string, on: string): ContrastIssue[] {
  const foreground = colors[text];
  const background = colors[on];
  if (typeof foreground !== 'string' || typeof background !== 'string') return [];
  const ratio = contrastRatio(foreground, background);
  return ratio < READABLE ? [{ scheme, text, on, ratio }] : [];
}

export function contrastIssues(dictionary: Dictionary, resolved: ResolvedTokens): ContrastIssue[] {
  const texts = namesIn(dictionary, 'scheme');
  return Object.entries(resolved.schemes).flatMap(([scheme, colors]) =>
    texts.flatMap((text) => (dictionary.tokens[text].on ?? []).flatMap((on) => pairIssues(scheme, colors, text, on))),
  );
}
