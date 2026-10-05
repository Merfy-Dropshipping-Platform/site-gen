import { dictionaryNames } from './dictionary';
import { KINDS, isFluidValue, isShadowValue, isTextValue, scalarText } from './kinds';
import { fluid, lengthCss, shadowCss } from './lengths';
import { resolveTokens } from './resolve';
import type {
  Dictionary,
  ResolvedTokens,
  ThemeTokens,
  TokenDef,
  TokenEdits,
  TokenKind,
  TokenSet,
  TokenValue,
} from './types';

// Печать CSS (design.md 8.4): корень, схемы с тенями, схемы деталей, покраска. Порядок строк — порядок словаря.

type Printer = (name: string, value: TokenValue) => string[];
type Slot = { name: string; scheme: string };

const declaration = (name: string, value: string): string => `--${name}: ${value};`;
const numberWithUnit = (value: TokenValue, unit: string): string => (value === 0 ? '0' : `${scalarText(value)}${unit}`);
const lengthText = (value: TokenValue): string =>
  typeof value === 'number' || isFluidValue(value) ? lengthCss(value) : scalarText(value);
const plain: Printer = (name, value) => [declaration(name, scalarText(value))];
const length: Printer = (name, value) => [declaration(name, lengthText(value))];
const textSize: Printer = (name, value) =>
  isTextValue(value)
    ? [declaration(name, fluid(value.min, value.max)), declaration(`${name}--line-height`, String(value.leading))]
    : plain(name, value);

// Виды корня. Цвета и тени печатаются в схемах, выборы — атрибутами, схемы деталей — своими блоками.
const ROOT_CSS: Partial<Record<TokenKind, Printer>> = {
  font: plain,
  weight: plain,
  text: textSize,
  tracking: (name, value) => [declaration(name, numberWithUnit(value, 'em'))],
  radius: length,
  'border-width': (name, value) => [declaration(name, numberWithUnit(value, 'px'))],
  spacing: length,
  width: length,
};

const namesWhere = (dictionary: Dictionary, test: (def: TokenDef) => boolean): string[] =>
  dictionaryNames(dictionary).filter((name) => test(dictionary.tokens[name]));

// Блок CSS: селектор и строки с отступом в два пробела. Им же пишет generate/tailwind.ts.
export const block = (selector: string, lines: readonly string[]): string =>
  `${selector} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;

function rootDeclarations(dictionary: Dictionary, root: Readonly<TokenSet>): string[] {
  return dictionaryNames(dictionary).flatMap((name) => {
    const print = ROOT_CSS[dictionary.tokens[name].kind];
    return print === undefined || !(name in root) ? [] : print(name, root[name]);
  });
}

// Переменные одной схемы: её цвета и тени. У тени цвет свой в каждой схеме, поэтому тени печатаются здесь.
function schemeDeclarations(dictionary: Dictionary, colors: Readonly<TokenSet>, root: Readonly<TokenSet>): string[] {
  const colorLines = namesWhere(dictionary, (def) => KINDS[def.kind].scope === 'scheme')
    .filter((name) => name in colors)
    .map((name) => declaration(name, scalarText(colors[name])));
  const shadowLines = namesWhere(dictionary, (def) => def.kind === 'shadow').flatMap((name) => {
    const value = root[name];
    return isShadowValue(value) ? [declaration(name, shadowCss(value, colors))] : [];
  });
  return [...colorLines, ...shadowLines];
}

// Заданные схемы деталей: деталь целиком берёт цвета своей схемы.
function slotsOf(dictionary: Dictionary, resolved: ResolvedTokens): Slot[] {
  return namesWhere(dictionary, (def) => def.kind === 'scheme').flatMap((name) => {
    const scheme = resolved.root[name];
    return typeof scheme === 'string' && scheme in resolved.schemes ? [{ name, scheme }] : [];
  });
}

const paintLayer = (selectors: readonly string[]): string =>
  `@layer base {\n  ${selectors.join(', ')} {\n    background-color: var(--background);\n    color: var(--foreground);\n  }\n}`;

export function emitCss(dictionary: Dictionary, resolved: ResolvedTokens): string {
  const ids = Object.keys(resolved.schemes);
  const schemeBlocks = ids.map((id, index) => {
    const selector = index === 0 ? `:root, .color-${id}` : `.color-${id}`;
    return block(selector, schemeDeclarations(dictionary, resolved.schemes[id], resolved.root));
  });
  const slots = slotsOf(dictionary, resolved);
  const slotBlocks = slots.map((slot) =>
    block(`.${slot.name}`, schemeDeclarations(dictionary, resolved.schemes[slot.scheme], resolved.root)),
  );
  const painted = [':root', ...ids.map((id) => `.color-${id}`), ...slots.map((slot) => `.${slot.name}`)];
  const blocks = [block(':root', rootDeclarations(dictionary, resolved.root)), ...schemeBlocks, ...slotBlocks];
  return `${[...blocks, paintLayer(painted)].join('\n')}\n`;
}

export const tokensCss = (dictionary: Dictionary, theme: ThemeTokens, edits: TokenEdits): string =>
  emitCss(dictionary, resolveTokens(dictionary, theme, edits));
