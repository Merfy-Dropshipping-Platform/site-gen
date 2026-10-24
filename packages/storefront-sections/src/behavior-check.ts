import { BEHAVIORS, PRESETS, type BehaviorSpec, type ParamSpec } from '@merfy/shell/behaviors/catalog';
import { fieldOf, isNode, type AstNode } from './ast';
import { TEMPLATE_FILE } from './format';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Поведения и появления в шаблоне секции (блок 6, часть 6б; Р6б-8): data-behavior, data-part, data-animate и параметры
// data-<имя> на корне поведения сверяются с каталогом SDK — опечатка находится при сохранении, а не в консоли у
// покупателя. Проверяются только значения-строки; значение из выражения по дереву не видно — пропускается, во время
// работы страницы параметр читается с запасным значением (readParams). Часть принадлежит ближайшему предку с
// data-behavior; на одном элементе data-behavior и data-part — часть внешнего поведения (элемент — вложенный корень),
// а параметры — собственного.
type ProblemCode =
  | 'behavior-unknown'
  | 'behavior-part-unknown'
  | 'behavior-part-orphan'
  | 'behavior-param-invalid'
  | 'animate-preset-unknown';

interface Attribute {
  name: string;
  value: string | null; // null — значение-выражение
  start: number;
}

interface Found {
  code: ProblemCode;
  at: number;
  message: string;
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const partsText = (parts: readonly string[]): string => (parts.length === 0 ? 'нет частей' : parts.join(', '));
const specOf = (name: string): BehaviorSpec | undefined => Object.entries(BEHAVIORS).find(([key]) => key === name)?.[1];
const knownBehaviors = (): string => Object.keys(BEHAVIORS).join(', ');
const knownPresets = (): string => Object.keys(PRESETS).join(', ');
const isIntegerInRange = (value: string, min: number, max: number): boolean =>
  /^-?\d+$/.test(value) && Number(value) >= min && Number(value) <= max;

function attributeOf(node: AstNode): Attribute | null {
  if (node.type !== 'JSXAttribute') return null;
  const nameNode = fieldOf(node, 'name');
  const name = isNode(nameNode) ? stringOf(fieldOf(nameNode, 'name')) : '';
  if (name === '' || name.startsWith('data-merfy')) return null;
  const value = fieldOf(node, 'value');
  if (isNode(value) && value.type === 'Literal' && typeof fieldOf(value, 'value') === 'string')
    return { name, value: stringOf(fieldOf(value, 'value')), start: node.start };
  return { name, value: value === null ? '' : null, start: node.start };
}

function attributesOf(node: AstNode): Attribute[] {
  const opening = fieldOf(node, 'openingElement');
  const raw: unknown = isNode(opening) ? fieldOf(opening, 'attributes') : [];
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  return list.filter(isNode).flatMap((item): Attribute[] => {
    const attribute = attributeOf(item);
    return attribute === null ? [] : [attribute];
  });
}

const RULES: Readonly<Record<ParamSpec['kind'], (spec: ParamSpec, value: string) => string | null>> = {
  enum: (spec, value) =>
    spec.kind === 'enum' && spec.values.includes(value)
      ? null
      : `нужно одно из: ${spec.kind === 'enum' ? spec.values.join(', ') : ''}`,
  int: (spec, value) =>
    spec.kind === 'int' && isIntegerInRange(value, spec.min, spec.max)
      ? null
      : `нужно целое число от ${spec.kind === 'int' ? spec.min : 0} до ${spec.kind === 'int' ? spec.max : 0}`,
  bool: (_spec, value) => (value === '' || value === 'true' || value === 'false' ? null : 'нужно true или false'),
  string: () => null,
  list: () => null,
};

function paramFound(attribute: Attribute, id: string, behavior: BehaviorSpec, name: string): Found | null {
  const param = behavior.params[id];
  if (param === undefined || attribute.value === null) return null;
  const rule = RULES[param.kind](param, attribute.value);
  if (rule === null) return null;
  return {
    code: 'behavior-param-invalid',
    at: attribute.start,
    message: `data-${id}="${attribute.value}" у поведения ${name}: ${rule}`,
  };
}

function delayFound(attributes: readonly Attribute[]): Found | null {
  const animate = attributes.find((attribute) => attribute.name === 'data-animate');
  if (animate === undefined || animate.value === null || !(animate.value in PRESETS)) return null;
  const delay = attributes.find((attribute) => attribute.name === 'data-delay');
  if (delay === undefined || delay.value === null || isIntegerInRange(delay.value, 0, 5000)) return null;
  return {
    code: 'behavior-param-invalid',
    at: delay.start,
    message: `data-delay="${delay.value}": нужно целое число от 0 до 5000`,
  };
}

function partFound(attribute: Attribute, outer: string | null): Found | null {
  if (attribute.value === null || outer === null) return null;
  const spec = specOf(outer);
  if (spec === undefined)
    return {
      code: 'behavior-part-orphan',
      at: attribute.start,
      message: `data-part="${attribute.value}" стоит вне элемента с data-behavior: часть принадлежит поведению`,
    };
  if (spec.parts.includes(attribute.value)) return null;
  return {
    code: 'behavior-part-unknown',
    at: attribute.start,
    message: `у поведения ${outer} нет части ${attribute.value}; есть: ${partsText(spec.parts)}`,
  };
}

const ORPHAN_TEXT = 'стоит вне элемента с data-behavior: часть принадлежит поведению';

const unknownFound = (attribute: Attribute): Found => ({
  code: 'behavior-unknown',
  at: attribute.start,
  message: `поведения ${attribute.value} нет в каталоге SDK; есть: ${knownBehaviors()}`,
});

const presetUnknownFound = (attribute: Attribute): Found => ({
  code: 'animate-preset-unknown',
  at: attribute.start,
  message: `пресета ${attribute.value} нет в каталоге SDK; есть: ${knownPresets()}`,
});

// Один атрибут элемента: имя поведения, пресет появления, часть (внешнего поведения), параметр (собственного).
function attributeFound(
  attribute: Attribute,
  own: BehaviorSpec | undefined,
  ownName: string,
  outer: string | null,
): Found[] {
  if (attribute.name === 'data-behavior' && attribute.value !== null && specOf(attribute.value) === undefined)
    return [unknownFound(attribute)];
  if (attribute.name === 'data-animate' && attribute.value !== null && !(attribute.value in PRESETS))
    return [presetUnknownFound(attribute)];
  if (attribute.name === 'data-part' && attribute.value !== null && outer === null)
    return [
      { code: 'behavior-part-orphan', at: attribute.start, message: `data-part="${attribute.value}" ${ORPHAN_TEXT}` },
    ];
  if (attribute.name === 'data-part' && outer !== null) {
    const part = partFound(attribute, outer);
    return part === null ? [] : [part];
  }
  if (own !== undefined && attribute.name.startsWith('data-')) {
    const param = paramFound(attribute, attribute.name.slice('data-'.length), own, ownName);
    return param === null ? [] : [param];
  }
  return [];
}

// Атрибуты одного элемента: имя поведения, пресет и задержка появления, часть (внешнего поведения), параметры (собственного).
function elementFound(node: AstNode, outer: string | null): Found[] {
  const attributes = attributesOf(node);
  const root = attributes.find((attribute) => attribute.name === 'data-behavior');
  const ownName = root !== undefined && root.value !== null ? root.value : '';
  const own = ownName === '' ? undefined : specOf(ownName);
  const found = attributes.flatMap((attribute) => attributeFound(attribute, own, ownName, outer));
  const delay = delayFound(attributes);
  return delay === null ? found : [...found, delay];
}

interface Context {
  behavior: string | null; // ближайший корень поведения со строкой; null — нет или имя-выражение
  checkInside: boolean; // имя корня — строка или корня нет: части внутри проверяются
}

// Обход — стеком, глубина шаблона не ограничена: childrenOf раскрывает и массивы, и одиночные узлы.
function childrenOf(node: AstNode): AstNode[] {
  return Object.values(node).flatMap((value) => {
    const list: unknown[] = Array.isArray(value) ? value : [value];
    return list.filter(isNode);
  });
}

// Один узел обхода: элемент — проверить и зайти внутрь с его контекстом, другой узел — зайти с прежним.
function stepOf(child: AstNode, context: Context, found: Found[]): { node: AstNode; context: Context } {
  if (child.type !== 'JSXElement') return { node: child, context };
  found.push(...elementFound(child, context.checkInside ? context.behavior : null));
  const root = attributesOf(child).find((attribute) => attribute.name === 'data-behavior');
  return {
    node: child,
    context: {
      behavior: root === undefined ? context.behavior : root.value,
      checkInside: root === undefined ? context.checkInside : root.value !== null,
    },
  };
}

export async function behaviorProblems(text: string): Promise<SectionProblem[]> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  const found: Found[] = [];
  const stack: { node: AstNode; context: Context }[] = isNode(ast)
    ? [{ node: ast, context: { behavior: null, checkInside: true } }]
    : [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const child of childrenOf(current.node)) stack.push(stepOf(child, current.context, found));
  }
  return found
    .sort((left, right) => left.at - right.at)
    .map((item) => problem(item.code, TEMPLATE_FILE, item.message, positionAt(text, item.at)));
}
