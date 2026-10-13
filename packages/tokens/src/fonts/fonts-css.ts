import { emitCss } from '../emit-css';
import { resolveTokens } from '../resolve';
import type { Dictionary, ResolvedTokens, ThemeTokens, TokenEdits } from '../types';
import type { FontEntry, FontFileEntry, FontRegistry } from './registry';

// CSS шрифтов магазина новой темы (design.md блока 12, «решил сам» 5, 7–11; Т12-2 А, Т12-3 А) — чистая функция рядом с
// tokensCss. Вход — стеки font-body и font-heading и насыщенности weight-body и weight-heading после правок мерчанта
// и реестр; выход — правила @font-face частями с unicode-range и font-display: swap, подогнанный запасной шрифт, файлы
// для манифеста и одна предзагрузка — главный файл шрифта текста. Семейство — первое имя стека; нет его в реестре —
// это системный шрифт: файлов нет.

export type FontRole = 'body' | 'heading';

export interface FontChoice {
  stack: string;
  weight: number;
}

export interface FontsCss {
  css: string;
  // Файлы для манифеста сборки: путь от корня сайта и отпечаток (они уже лежат в хранилище — блок 5).
  files: FontFileEntry[];
  // Путь главного файла шрифта текста от корня сайта (/_fonts/…) или null — шрифт текста системный.
  preload: string | null;
}

const ROLES: readonly FontRole[] = ['body', 'heading'];
const VARIABLE_FACE = 'wght';
// Главная часть для предзагрузки: русский магазин пишет кириллицей; шрифт без кириллицы — латиница.
const PRELOAD_SUBSETS = ['cyrillic', 'latin'];
const QUOTES = /^["']|["']$/g;

interface UsedFace {
  key: string;
  font: FontEntry;
  face: string;
}

export const familyOf = (stack: string): string => stack.split(',')[0].trim().replace(QUOTES, '');

function keyOf(registry: FontRegistry, family: string): string | undefined {
  const wanted = family.toLowerCase();
  return Object.keys(registry.fonts).find((key) => registry.fonts[key].family.toLowerCase() === wanted);
}

// Статичный шрифт: ближайшая насыщенность из реестра, при равенстве — тоньше.
function nearestWeight(weights: readonly number[], wanted: number): number {
  const distance = (weight: number): number => Math.abs(weight - wanted) * 2 + (weight > wanted ? 1 : 0);
  return weights.reduce((best, weight) => (distance(weight) < distance(best) ? weight : best));
}

function usedFace(registry: FontRegistry, choice: FontChoice): UsedFace | null {
  const key = keyOf(registry, familyOf(choice.stack));
  if (key === undefined) return null;
  const font = registry.fonts[key];
  const face = font.axes === null ? String(nearestWeight(font.weights, choice.weight)) : VARIABLE_FACE;
  return { key, font, face };
}

const weightRange = (font: FontEntry, face: string): string =>
  face === VARIABLE_FACE ? `${font.weights[0]} ${font.weights[font.weights.length - 1]}` : face;

function faceRules({ font, face }: UsedFace): string[] {
  const subsets = Object.values(font.subsets).filter((subset) => face in subset.files);
  return subsets.map((subset) =>
    [
      `@font-face{font-family:"${font.family}";font-style:normal;font-display:swap;`,
      `font-weight:${weightRange(font, face)};src:url(/${subset.files[face].path}) format("woff2");`,
      `unicode-range:${subset['unicode-range']}}`,
    ].join(''),
  );
}

function fallbackRule(font: FontEntry): string {
  const { metrics } = font;
  return [
    `@font-face{font-family:"${font.family} Fallback";src:local("${metrics.base}");`,
    `size-adjust:${metrics['size-adjust']};ascent-override:${metrics['ascent-override']};`,
    `descent-override:${metrics['descent-override']};line-gap-override:${metrics['line-gap-override']}}`,
  ].join('');
}

const faceId = (used: UsedFace): string => `${used.key}/${used.face}`;
const filesOf = ({ font, face }: UsedFace): FontFileEntry[] =>
  Object.values(font.subsets).flatMap((subset) => (face in subset.files ? [subset.files[face]] : []));

function preloadOf(body: UsedFace | null): string | null {
  if (body === null) return null;
  const subset = PRELOAD_SUBSETS.find((name) => body.font.subsets[name]?.files[body.face] !== undefined);
  return subset === undefined ? null : `/${body.font.subsets[subset].files[body.face].path}`;
}

export function fontsCss(registry: FontRegistry, choices: Readonly<Record<FontRole, FontChoice>>): FontsCss {
  const used = ROLES.map((role) => usedFace(registry, choices[role]));
  const faces = [...new Map(used.flatMap((face) => (face === null ? [] : [[faceId(face), face] as const]))).values()];
  const fonts = [...new Map(faces.map((face) => [face.key, face.font] as const)).values()];
  const rules = [...faces.flatMap(faceRules), ...fonts.map(fallbackRule)];
  return { css: rules.join('\n'), files: faces.flatMap(filesOf), preload: preloadOf(used[0]) };
}

// Стек шрифта для CSS токенов. Панель (блок 8) пишет в токен «Lora, system-ui, sans-serif» — имя без кавычек и без
// запасного. Семейство из реестра печатается стеком реестра: «"Lora", "Lora Fallback", serif» — так в стек попадает
// подогнанный запасной (Т12-3 А). Семейства нет в реестре — значение как есть.
export function fontStack(registry: FontRegistry, stack: string): string {
  const key = keyOf(registry, familyOf(stack));
  return key === undefined ? stack : registry.fonts[key].stack;
}

const FONT_TOKENS = ['font-body', 'font-heading'];

// Значения после правок, стеки шрифтов — по реестру. Подмена после расчёта: правила словаря (производный
// font-heading = font-body) и сохранённые правки мерчанта не меняются, меняется только печать.
function withFontStacks(registry: FontRegistry, resolved: ResolvedTokens): ResolvedTokens {
  const stacks = FONT_TOKENS.flatMap((name) => {
    const value = resolved.root[name];
    return typeof value === 'string' ? [[name, fontStack(registry, value)] as const] : [];
  });
  return { ...resolved, root: { ...resolved.root, ...Object.fromEntries(stacks) } };
}

// CSS токенов новой темы со стеками шрифтов реестра — его печатают магазин, стенд и превью (блок 12).
export const tokensCssWithFonts = (
  registry: FontRegistry,
  dictionary: Dictionary,
  theme: ThemeTokens,
  edits: TokenEdits,
): string => emitCss(dictionary, withFontStacks(registry, resolveTokens(dictionary, theme, edits)));
