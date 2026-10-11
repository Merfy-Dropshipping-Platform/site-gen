import { AtRule, CssSyntaxError, parse, type ChildNode, type Root, type Rule } from 'postcss';
import { STYLE_FILE } from './format';
import type { Position } from './position';
import { isWarning, problem, type Checked, type SectionProblem } from './problems';

// Стили секции (design.md блока 7, п. 17): правила любой секции — в рамке её обёртки, «все кнопки круглые» в подборе
// меняет только кнопки подбора. :scope — сама обёртка. html, body, :root — отказ: меняют всю страницу. @import,
// @font-face, @charset, @namespace — отказ: внешние файлы и шрифты — дело темы. Вложенные правила — отказ: рамку
// ставим одним проходом. Сырой цвет (#hex, rgb(), hsl()) — предупреждение: цвета — переменные словаря (блок 1).
// @keyframes не трогаем: внутри проценты, а не селекторы.
const FORBIDDEN_AT_RULES: ReadonlySet<string> = new Set(['import', 'font-face', 'charset', 'namespace']);
const PAGE_SELECTOR = /(?:^|[\s>+~(])(?:html|body)(?=$|[\s>+~.#:[)])|:root\b/i;
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

export interface ScopedStyle {
  css: string;
  warnings: SectionProblem[];
}

export const scopeOf = (name: string): string => `merfy-section[data-section="${name}"]`;

const placeOf = (node: ChildNode): Position | undefined => node.source?.start;

function nodeProblems(node: ChildNode): SectionProblem[] {
  if (node.type === 'atrule' && FORBIDDEN_AT_RULES.has(node.name.toLowerCase()))
    return [
      problem('style-forbidden', STYLE_FILE, `@${node.name} нельзя: внешние файлы и шрифты — у темы`, placeOf(node)),
    ];
  if (node.type === 'rule' && node.parent?.type === 'rule')
    return [problem('style-forbidden', STYLE_FILE, 'вложенное правило нельзя: разверните его', placeOf(node))];
  if (node.type === 'rule' && node.selectors.some((selector) => PAGE_SELECTOR.test(selector)))
    return [problem('style-forbidden', STYLE_FILE, `«${node.selector}» меняет всю страницу`, placeOf(node))];
  if (node.type === 'decl' && RAW_COLOR.test(node.value))
    return [
      problem('style-raw-color', STYLE_FILE, `цвет «${node.value}» мимо токенов: возьмите var(--…)`, placeOf(node)),
    ];
  return [];
}

function parseCss(css: string): Checked<Root> {
  try {
    return { ok: true, value: parse(css, { from: STYLE_FILE }) };
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) throw error;
    const at = { line: error.line ?? 1, column: error.column ?? 1 };
    return { ok: false, problems: [problem('style-invalid', STYLE_FILE, error.reason, at)] };
  }
}

const inKeyframes = (rule: Rule): boolean =>
  rule.parent instanceof AtRule && rule.parent.name.toLowerCase().endsWith('keyframes');

const scoped = (selector: string, scope: string): string =>
  selector.includes(':scope') ? selector.replaceAll(':scope', scope) : `${scope} ${selector}`;

function scopeRules(root: Root, scope: string): void {
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    rule.selectors = rule.selectors.map((selector) => scoped(selector, scope));
  });
}

export function scopeStyle(css: string, name: string): Checked<ScopedStyle> {
  const parsed = parseCss(css);
  if (!parsed.ok) return parsed;
  const found: SectionProblem[] = [];
  parsed.value.walk((node) => void found.push(...nodeProblems(node)));
  if (found.some((item) => !isWarning(item))) return { ok: false, problems: found };
  scopeRules(parsed.value, scopeOf(name));
  return { ok: true, value: { css: parsed.value.toString(), warnings: found } };
}
