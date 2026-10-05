import { BLACK, READABLE, WHITE, contrastRatio, luminance, mixHex } from './color';
import { valueText } from './kinds';
import type { DeriveRule, Dictionary, RuleName, TokenDef, TokenSet, TokenValue } from './types';

// Наведение сдвигает цвет на 12 % к белому или чёрному — то же число, что у нынешних тем (HOVER_SHIFT в tokens-css.ts).
export const HOVER_SHIFT = 0.12;
const MID_LUMINANCE = 0.5;
const PERCENT = 100;
const OPPOSITE: Record<string, string> = { [WHITE]: BLACK, [BLACK]: WHITE };

const poleOf = (hex: string): string => (luminance(hex) < MID_LUMINANCE ? WHITE : BLACK);
const shift = (hex: string, toward: string): string => mixHex(hex, toward, 1 - HOVER_SHIFT);

// Сдвиг к белому или чёрному; если надпись от этого читается хуже — в другую сторону.
export function hoverColor(base: string, text: string): string {
  const toward = poleOf(base);
  const direct = shift(base, toward);
  const directRatio = contrastRatio(text, direct);
  if (directRatio >= READABLE) return direct;
  if (text !== poleOf(direct)) return direct;
  const flipped = shift(base, OPPOSITE[toward]);
  return contrastRatio(text, flipped) > directRatio ? flipped : direct;
}

// Белый или чёрный — что читается лучше.
export const contrastColor = (base: string): string =>
  contrastRatio(base, WHITE) >= contrastRatio(base, BLACK) ? WHITE : BLACK;

// Цвета по именам — все или ни одного: без источника правило ничего не считает.
function colorsAt(values: Readonly<TokenSet>, names: readonly string[]): string[] | undefined {
  const found = names.map((name) => values[name]).filter((value): value is string => typeof value === 'string');
  return found.length === names.length ? found : undefined;
}

type RuleFn<R extends RuleName> = (rule: DeriveRule<R>, values: Readonly<TokenSet>) => TokenValue | undefined;

const RULES: { [R in RuleName]: RuleFn<R> } = {
  alias: (rule, values) => values[rule.from],
  mix: (rule, values) => {
    const colors = colorsAt(values, rule.from);
    return colors === undefined ? undefined : mixHex(colors[0], colors[1], rule.weight);
  },
  hover: (rule, values) => {
    const colors = colorsAt(values, [rule.from, rule.text]);
    return colors === undefined ? undefined : hoverColor(colors[0], colors[1]);
  },
  contrast: (rule, values) => {
    const colors = colorsAt(values, [rule.from]);
    return colors === undefined ? undefined : contrastColor(colors[0]);
  },
};

export function applyRule<R extends RuleName>(rule: DeriveRule<R>, values: Readonly<TokenSet>): TokenValue | undefined {
  const apply: RuleFn<R> = RULES[rule.rule];
  return apply(rule, values);
}

// ---- правило словами: «как background», «смесь: 12 % foreground в background». quote оформляет имена и значения.
type Quote = (text: string) => string;
const plain: Quote = (text) => text;

const RULE_TEXT: { [R in RuleName]: (rule: DeriveRule<R>, quote: Quote) => string } = {
  alias: (rule, quote) => `как ${quote(rule.from)}`,
  mix: (rule, quote) => `смесь: ${Math.round(rule.weight * PERCENT)} % ${quote(rule.from[0])} в ${quote(rule.from[1])}`,
  hover: (rule, quote) => `наведение от ${quote(rule.from)}`,
  contrast: (rule, quote) => `белый или чёрный к ${quote(rule.from)}`,
};

function deriveText<R extends RuleName>(rule: DeriveRule<R>, quote: Quote): string {
  const describe: (rule: DeriveRule<R>, quote: Quote) => string = RULE_TEXT[rule.rule];
  return describe(rule, quote);
}

function fallbackText(def: TokenDef, quote: Quote): string {
  if (def.default !== undefined) return `по умолчанию ${quote(valueText(def.kind, def.default))}`;
  return def.kind === 'scheme' ? 'не задана — как у родителя' : 'задаёт тема';
}

// Откуда значение, если его никто не задал: правило, умолчание, родитель или тема.
export function ruleText(dictionary: Dictionary, name: string, quote: Quote = plain): string {
  const def = dictionary.tokens[name];
  return def.derive === undefined ? fallbackText(def, quote) : deriveText(def.derive, quote);
}
