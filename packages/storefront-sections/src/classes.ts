import type { ClassSystem } from '@merfy/storefront-build';
import { classesOf, type Dictionary } from '@merfy/tokens';
import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { TEMPLATE_FILE } from './format';
import { inertFindings } from './inert-classes';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Шаг «Классы» (блок 4 «Секций и SDK», design.md 4.1, Р4-5…Р4-8): классы атрибутов class и class:list — только
// Tailwind из словаря; свой CSS запрещён (7 Г). Дерево шаблона — тот же разбор @astrojs/compiler-rs, что у
// template.ts. Правила — таблицей, первое сработавшее; место — начало класса (или выражения) в тексте шаблона.

export interface ClassField {
  id: string;
  label: string;
  setting: { kind: string; options?: readonly { value: string }[]; min?: number; max?: number; step?: number };
}
// Поля секции и поля всех типов блоков подряд (часть 3 блока 1: blocks.<тип>.settings).
export interface ClassFields {
  settings: readonly ClassField[];
  blocks: readonly ClassField[];
}

// Виды с конечным набором значений (Р4-6, Р1-5-10): select и radio — значения вариантов, toggle — 'true' и 'false',
// alignment — три стороны, range — значения от min до max на шаге step (строками, как попадут в класс). Больше 101
// значения или нет одного из min, max, step — пустой список: значения не перечислить (class-dynamic).
const RANGE_VALUES_MAX = 101;
const rangeValues = (field: ClassField): readonly string[] => {
  const { min, max, step } = field.setting;
  if (min === undefined || max === undefined || step === undefined || step <= 0) return [];
  const steps = Math.floor((max - min) / step) + 1;
  if (steps > RANGE_VALUES_MAX) return [];
  return Array.from({ length: steps }, (_unused, index) => String(min + index * step));
};

export const FINITE_VALUES: Readonly<Record<string, (field: ClassField) => readonly string[]>> = {
  select: (field) => (field.setting.options ?? []).map((option) => option.value),
  radio: (field) => (field.setting.options ?? []).map((option) => option.value),
  toggle: () => ['true', 'false'],
  alignment: () => ['left', 'center', 'right'],
  range: rangeValues,
};
// Классы платформы без своего CSS у Tailwind (Р4-7): group, peer, group/<имя>, peer/<имя>.
export const PLATFORM_CLASS: RegExp = /^(?:group|peer)(?:\/[a-z0-9-]+)?$/;

const CLASS_ATTRIBUTES: ReadonlySet<string> = new Set(['class', 'class:list']);
// Вариант по атрибуту (Р4-5): data-[…] и aria-[…], в том числе с префиксами group-, peer-, in-, not-.
const ATTRIBUTE_VARIANT: RegExp = /^(?:group-|peer-|in-|not-)?(?:data-|aria-)\[/;
const DARK_VARIANT = 'dark';
const THEME_MARK = /-theme(?:-|$)/;
const SPACING_STEP = 4;

const TEXT = {
  unknown: (name: string, hint: string) => `класс ${name} не из словаря${hint}`,
  arbitrary: (name: string, hint: string) => `${name} — произвольное значение, это свой CSS${hint}`,
  selector: (name: string) =>
    `${name} — свой селектор. Дочерним элементам — вариант *:p-2, состояниям — data-* и aria-*`,
  important: (name: string) => `${name} — важность !: убери её, класс перекрой токеном`,
  dark: (name: string) =>
    `${name}: dark: включает вид по настройке телефона покупателя. Тёмный вид секции — схема цвета в общих настройках`,
  themeToken: (name: string) =>
    `${name} — свой токен темы, он есть только в одной теме, а секция к теме не привязана. Нужен свой цвет — токен секции`,
  dynamic: (field: ClassField) =>
    `класс из настройки «${field.label}» (${field.setting.kind}): её значения не перечислить. Пишите классы целиком: class:list={[{ 'text-center': settings.align === 'center' }]}`,
  expression:
    "класс собран выражением — значения не перечислить. Пишите классы целиком: class:list={[{ 'text-center': settings.align === 'center' }]}",
  family: (names: readonly string[]) => ` Семейство словаря: ${names.join(', ')}.`,
  close: (name: string) => ` Может, ${name}?`,
  sectionToken: ' Нужен свой — токен секции "custom-…" в section.json',
  spacing: (name: string, near: string, px: number) =>
    ` Шкала отступов — шаг ${SPACING_STEP} px: ${near} — ${px} px; отступ секции — p-section`,
  scriptHook: ' Скрипту — атрибут data-ref, виду — классы словаря',
} as const;

type ClassAt = { name: string; at: number };
type Found = { at: number; message: string };
type Reading = { classes: ClassAt[]; dynamic: Found[] };

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

// Варианты и утилита делятся по «:» вне скобок (Р4-5), «!» — в утилите.
function partsOf(name: string): { variants: string[]; utility: string } {
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of name) {
    const opens = char === '[' || char === '(';
    const closes = char === ']' || char === ')';
    if (opens) depth += 1;
    if (closes) depth -= 1;
    if (char === ':' && depth === 0) {
      segments.push(current);
      current = '';
    } else current += char;
  }
  segments.push(current);
  return { variants: segments.slice(0, -1), utility: segments[segments.length - 1] ?? '' };
}

const hasArbitrary = (segment: string): boolean => /[[(]|!/.test(segment);
const isAttributeVariant = (variant: string): boolean => ATTRIBUTE_VARIANT.test(variant);

// Правила — по тексту класса, первое сработавшее (design.md 4.1): arbitrary, dark, токен темы; утилита — до «!».
function textProblem(name: string): RuleFinding | undefined {
  const { variants, utility } = partsOf(name);
  const plainUtility = utility.replace(/!+$/, '');
  const withImportant = utility.includes('!');
  if (variants.includes(DARK_VARIANT)) return { code: 'class-dark', message: TEXT.dark(name) };
  if (hasArbitrary(plainUtility)) return { code: 'class-arbitrary', message: arbitraryMessage(name, plainUtility) };
  if (withImportant) return { code: 'class-arbitrary', message: TEXT.important(name) };
  const wrongVariant = variants.find((variant) => hasArbitrary(variant) && !isAttributeVariant(variant));
  if (wrongVariant !== undefined) return { code: 'class-arbitrary', message: variantMessage(name, wrongVariant) };

  if (THEME_MARK.test(plainUtility)) return { code: 'class-theme-token', message: TEXT.themeToken(name) };
  return undefined;
}

function arbitraryMessage(name: string, utility: string): string {
  const spacing = /^p-\[(\d+)px\]$/.exec(name);
  if (spacing !== null) {
    const step = Math.round(Number(spacing[1]) / SPACING_STEP);
    return TEXT.arbitrary(name, TEXT.spacing(name, `p-${step}`, step * SPACING_STEP));
  }
  if (utility.startsWith('[')) return TEXT.selector(name);
  if (utility !== name) return TEXT.important(name);
  return TEXT.arbitrary(name, TEXT.sectionToken);
}

function variantMessage(name: string, variant: string): string {
  if (variant.startsWith('[')) return TEXT.selector(name);
  if (variant.includes('!')) return TEXT.important(name);
  return TEXT.arbitrary(name, TEXT.sectionToken);
}

// Классы словаря вида scheme (Р4-7): CSS у них в токенах темы, у Tailwind его нет.
const schemeClasses = (dictionary: Dictionary): readonly string[] =>
  Object.entries(dictionary.tokens)
    .filter(([, def]) => def.kind === 'scheme')
    .flatMap(([name, def]) => classesOf(name, def));

const allowedWithoutCss = (dictionary: Dictionary): ReadonlySet<string> =>
  new Set([...schemeClasses(dictionary), 'color-scheme-1']);

function closeNames(name: string, system: ClassSystem): readonly string[] {
  const near = system
    .classNames()
    .filter((known) => Math.abs(known.length - name.length) <= 2 && distanceOf(name, known) <= 2);
  return near.slice(0, 3);
}

function distanceOf(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = Array.from({ length: right.length + 1 }, (_, index) => (index === 0 ? i : 0));
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

// Семейство словаря (Р4-8): известные Tailwind имена с тем же префиксом, что у класса. Сначала простые имена —
// без второго префикса: rounded-card, а не rounded-b-card.
const familyOf = (name: string, system: ClassSystem): readonly string[] => {
  const prefix = name.slice(0, name.lastIndexOf('-') + 1);
  if (prefix === '') return [];
  const samePrefix = system.classNames().filter((known) => known.startsWith(prefix));
  const simple = samePrefix.filter((known) => !known.slice(prefix.length).includes('-'));
  return (simple.length > 0 ? simple : samePrefix).slice(0, 8);
};

function unknownMessage(name: string, system: ClassSystem): string {
  const family = familyOf(name, system);
  const close = closeNames(name, system);
  const parts = [
    ...(family.length > 0 ? [TEXT.family(family)] : []),
    ...close.map((known) => TEXT.close(known)),
    ...(family.length === 0 && close.length === 0 && name.startsWith('js-') ? [TEXT.scriptHook] : []),
    ...(family.length === 0 && close.length === 0 && !name.startsWith('js-') ? [TEXT.sectionToken] : []),
  ];
  return TEXT.unknown(name, parts.join(''));
}

type RuleFinding = { code: 'class-unknown' | 'class-arbitrary' | 'class-dark' | 'class-theme-token'; message: string };

// Проверка одного класса: сначала правила по тексту, потом Tailwind со словарём и классы платформы.
export function classProblem(name: string, system: ClassSystem, dictionary: Dictionary): RuleFinding | undefined {
  const byText = textProblem(name);
  if (byText !== undefined) return byText;
  if (PLATFORM_CLASS.test(name)) return undefined;
  if (allowedWithoutCss(dictionary).has(name)) return undefined;
  if (name.startsWith('color-scheme-')) {
    return { code: 'class-unknown', message: TEXT.unknown(name, ` ${name} ставит только платформа на обёртку`) };
  }
  const css = system.cssOf([name])[0];
  if (css !== null) return undefined;
  return { code: 'class-unknown', message: unknownMessage(name, system) };
}

// ---- разбор выражений атрибутов class и class:list

type ExpressionRule = (node: AstNode, fields: ClassFields, dynamic: Found[]) => ClassAt[];

const literalClasses = (node: AstNode): ClassAt[] =>
  classesOfSegments([{ text: stringOf(fieldOf(node, 'value')), at: node.start + 1 }]);

// Имя члена цепочки (Р1-5-9, Р1-5-10): «.<id>» — имя свойства; «['<id>']» и «["<id>"]» — значение строки-литерала (id
// полей — kebab-case, поэтому их пишут в скобках). Скобки не с литералом — settings[name], settings[0] — имени не дают:
// такая запись остаётся динамической.
function memberNameOf(node: AstNode): string | undefined {
  const property = fieldOf(node, 'property');
  if (!isNode(property)) return undefined;
  if (fieldOf(node, 'computed') !== true) return stringOf(fieldOf(property, 'name'));
  const literal = property.type === 'Literal' ? fieldOf(property, 'value') : undefined;
  return typeof literal === 'string' ? literal : undefined;
}

function chainOf(node: AstNode): string[] | undefined {
  const name = memberNameOf(node);
  if (name === undefined) return undefined;
  const object = fieldOf(node, 'object');
  if (!isNode(object)) return [name];
  const parent = object.type === 'MemberExpression' ? chainOf(object) : undefined;
  if (object.type === 'Identifier') return [stringOf(fieldOf(object, 'name')), name];
  return parent === undefined ? undefined : [...parent, name];
}

// Поле по цепочке «…settings.<id>» (Р4-6): сначала у секции, потом у типов блоков.
function fieldOfChain(chain: readonly string[], fields: ClassFields): ClassField | undefined {
  const id = chain[chain.length - 2] === 'settings' ? chain[chain.length - 1] : undefined;
  if (id === undefined) return undefined;
  return fields.settings.find((field) => field.id === id) ?? fields.blocks.find((field) => field.id === id);
}

function valuesOfField(node: AstNode, chain: readonly string[], fields: ClassFields, dynamic: Found[]): ClassAt[] {
  const field = fieldOfChain(chain, fields);
  const finite = field === undefined ? undefined : FINITE_VALUES[field.setting.kind];
  const values = field !== undefined && finite !== undefined ? finite(field) : [];
  if (values.length > 0) return values.map((value) => ({ name: value, at: node.start }));
  if (field !== undefined) dynamic.push({ at: node.start, message: TEXT.dynamic(field) });
  else dynamic.push({ at: node.start, message: TEXT.expression });
  return [];
}

const memberClasses: ExpressionRule = (node, fields, dynamic) => {
  const chain = chainOf(node);
  if (chain === undefined) {
    dynamic.push({ at: node.start, message: TEXT.expression });
    return [];
  }
  return valuesOfField(node, chain, fields, dynamic);
};

type Segment = { text: string; at: number };

// Класс схемы (Р1-5-9): подстановка поля вида color-scheme после ровно «color-» (перед ним — начало строки или пробел)
// — класс не проверяется: CSS даёт токены магазина, не Tailwind. Маркер после склейки отфильтровывается.
const SCHEME_PREFIX = 'color-';
const SCHEME_MARK = '\u0000scheme';
const textOf = (variant: readonly Segment[]): string => variant.map((segment) => segment.text).join('');
const endsWithSchemePrefix = (text: string): boolean => {
  const at = text.lastIndexOf(SCHEME_PREFIX);
  return at >= 0 && (at === 0 || text[at - 1] === ' ');
};
const isSchemeField = (expression: AstNode, fields: ClassFields): boolean => {
  if (expression.type !== 'MemberExpression') return false;
  const chain = chainOf(expression);
  return chain !== undefined && fieldOfChain(chain, fields)?.setting.kind === 'color-scheme';
};

// Каждое значение подстановки — своим вариантом строки классов (Р4-6): проверяем каждое значение.
const withValues = (variants: readonly Segment[][], values: readonly ClassAt[], at: number): Segment[][] =>
  variants.flatMap((variant) => values.map((value) => [...variant, { text: value.name, at }]));

function templateClasses(node: AstNode, fields: ClassFields, dynamic: Found[]): ClassAt[] {
  const quasis = nodesOf(node)
    .filter((inner) => inner.type === 'TemplateElement' && inner.start >= node.start && inner.end <= node.end)
    .sort((left, right) => left.start - right.start);
  const expressions = arrayOf(fieldOf(node, 'expressions')).filter(isNode);
  const variants: Segment[][] = [[]];
  for (const [index, quasi] of quasis.entries()) {
    for (const variant of variants) variant.push({ text: valueCookedOf(quasi), at: quasi.start });
    const expression = expressions[index];
    if (expression === undefined) continue;
    const scheme =
      isSchemeField(expression, fields) && variants.every((variant) => endsWithSchemePrefix(textOf(variant)));
    const substituted = scheme
      ? [{ name: SCHEME_MARK, at: expression.start }]
      : expressionClasses(expression, fields, { classes: [], dynamic });
    const values = substituted.length === 0 ? [{ name: '', at: expression.start }] : substituted;
    variants.push(...withValues(variants.splice(0, variants.length), values, expression.start));
  }
  return variants.flatMap((variant) => classesOfSegments(variant)).filter((item) => !item.name.includes(SCHEME_MARK));
}

const valueCookedOf = (quasi: AstNode): string => {
  const value = fieldOf(quasi, 'value');
  const cooked = isNode(value) ? undefined : value;
  return typeof cooked === 'object' && cooked !== null && 'cooked' in cooked
    ? String(Reflect.get(cooked, 'cooked'))
    : '';
};

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const conditionalClasses: ExpressionRule = (node, fields, dynamic) => {
  const branches = [fieldOf(node, 'consequent'), fieldOf(node, 'alternate')].filter(isNode);
  return branches.flatMap((branch) => expressionClasses(branch, fields, { classes: [], dynamic }));
};

const arrayClasses: ExpressionRule = (node, fields, dynamic) =>
  arrayOf(fieldOf(node, 'elements'))
    .filter(isNode)
    .flatMap((element) => expressionClasses(element, fields, { classes: [], dynamic }));

function propertyClasses(node: AstNode, dynamic: Found[]): ClassAt[] {
  const key = fieldOf(node, 'key');
  if (!isNode(key)) return [];
  if (key.type === 'Identifier') return [{ name: stringOf(fieldOf(key, 'name')), at: key.start }];
  if (key.type === 'Literal') return classesOfSegments([{ text: stringOf(fieldOf(key, 'value')), at: key.start + 1 }]);
  dynamic.push({ at: key.start, message: TEXT.expression });
  return [];
}

const objectClasses: ExpressionRule = (node, _fields, dynamic) =>
  arrayOf(fieldOf(node, 'properties'))
    .filter(isNode)
    .flatMap((property) => propertyClasses(property, dynamic));

// a && 'x' — классы правой части (левая — условие); a || 'x' и a ?? 'x' — обеих частей (план 4а, Р1-5-9).
const logicalClasses: ExpressionRule = (node, fields, dynamic) => {
  const right = fieldOf(node, 'right');
  const parts = fieldOf(node, 'operator') === '&&' ? [right] : [fieldOf(node, 'left'), right];
  return parts.filter(isNode).flatMap((part) => expressionClasses(part, fields, { classes: [], dynamic }));
};

const EXPRESSION_RULES: Partial<Record<string, ExpressionRule>> = {
  Literal: (node) => literalClasses(node),
  TemplateLiteral: (node, fields, dynamic) => templateClasses(node, fields, dynamic),
  ConditionalExpression: conditionalClasses,
  LogicalExpression: logicalClasses,
  ArrayExpression: arrayClasses,
  ObjectExpression: objectClasses,
  MemberExpression: memberClasses,
};

function expressionClasses(expression: AstNode, fields: ClassFields, reading: Reading): ClassAt[] {
  const rule = EXPRESSION_RULES[expression.type];
  const classes = rule === undefined ? [] : rule(expression, fields, reading.dynamic);
  if (rule === undefined) reading.dynamic.push({ at: expression.start, message: TEXT.expression });
  return classes;
}

// Классы по сегментам текста с якорями: границы сегментов не рвут класс, якорь — начало сегмента.
function classesOfSegments(segments: readonly { text: string; at: number }[]): ClassAt[] {
  const joined = segments.map((segment) => segment.text).join('');
  const marks = segments.map((segment, index) => ({
    start: segments.slice(0, index).reduce((sum, part) => sum + part.text.length, 0),
    at: segment.at,
  }));
  const found: ClassAt[] = [];
  for (const match of joined.matchAll(/\S+/g)) {
    const index = match.index ?? 0;
    const mark = [...marks].reverse().find((item) => item.start <= index);
    found.push({ name: match[0], at: (mark?.at ?? 0) + index - (mark?.start ?? 0) });
  }
  return found;
}

// ---- шаг «Классы»: обход дерева шаблона, атрибуты class и class:list

function nameOf(node: AstNode): string {
  const name = fieldOf(node, 'name');
  return isNode(name) ? stringOf(fieldOf(name, 'name')) : '';
}

function attributeClasses(node: AstNode, fields: ClassFields, dynamic: Found[]): ClassAt[] {
  const value = fieldOf(node, 'value');
  if (!isNode(value)) return [];
  if (value.type === 'Literal') return literalClasses(value);
  const expression = fieldOf(value, 'expression');
  return isNode(expression) ? expressionClasses(expression, fields, { classes: [], dynamic }) : [];
}

// Классы без стилей на экране (inert-classes.ts): по элементам, у которых каждый класс прошёл проверку выше — иначе
// отказ уже есть, второй про тот же класс только шумит.
function inertFindingsOf(
  ast: unknown,
  fields: ClassFields,
  system: ClassSystem,
  dictionary: Dictionary,
): { at: number; code: 'class-inert'; message: string }[] {
  const fills = (utility: string): boolean => system.cssOf([utility])[0]?.includes('background-color') === true;
  return nodesOf(ast)
    .filter((node) => node.type === 'JSXOpeningElement')
    .flatMap((element) => {
      const attributes = fieldOf(element, 'attributes');
      const list = Array.isArray(attributes) ? attributes.filter(isNode) : [];
      const classes = list
        .filter((attribute) => attribute.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(nameOf(attribute)))
        .flatMap((attribute) => attributeClasses(attribute, fields, []));
      if (classes.some((item) => classProblem(item.name, system, dictionary) !== undefined)) return [];
      const named = classes.map((item) => ({ ...item, utility: partsOf(item.name).utility }));
      return inertFindings(named, fills).map((item) => ({ ...item, code: 'class-inert' as const }));
    });
}

export async function classProblems(
  text: string,
  fields: ClassFields,
  system: ClassSystem,
  dictionary: Dictionary,
): Promise<SectionProblem[]> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  const dynamic: Found[] = [];
  const classes = nodesOf(ast)
    .filter((node) => node.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(nameOf(node)))
    .flatMap((node) => attributeClasses(node, fields, dynamic));
  const classFindings = classes.flatMap((item) => {
    const itemProblem = classProblem(item.name, system, dictionary);
    return itemProblem === undefined ? [] : [{ at: item.at, ...itemProblem }];
  });
  const dynamicFindings = dynamic.map((item) => ({
    at: item.at,
    code: 'class-dynamic' as const,
    message: item.message,
  }));
  return [...classFindings, ...dynamicFindings, ...inertFindingsOf(ast, fields, system, dictionary)]
    .sort((left, right) => left.at - right.at)
    .map((item) => problem(item.code, TEMPLATE_FILE, item.message, positionAt(text, item.at)));
}
