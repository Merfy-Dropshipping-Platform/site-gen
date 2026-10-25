import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { settingFieldsOf, type SectionField, type SectionSettingSpec } from './fields';
import { TEMPLATE_FILE, type SectionManifest } from './format';
import { blocksMapCall, firstOf, identifierOf, isMember, stringOf, type Insert } from './marks';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Правка текста в превью (блок 1 «Секций и SDK», часть 6, Р1-6-1…Р1-6-5): какие настройки правятся в превью и где в
// шаблоне их элемент. Метки ставятся так же, как метки блоков (marks.ts): вставки в открывающие теги, автор их не пишет.
export type EditKind = 'string' | 'text' | 'richtext';
export interface EditTarget {
  kind: EditKind;
  label: string; // подпись настройки: подсказка пустого элемента в превью
}
export interface EditTargets {
  section: ReadonlyMap<string, EditTarget>; // id настройки секции с "inlineEdit": true
  block: ReadonlyMap<string, EditTarget>; // id настройки блока: флаг у всех типов блока, где есть настройка с этим id
}
export const NO_EDIT_TARGETS: EditTargets = { section: new Map(), block: new Map() };

const isEditableSpec = (spec: SectionSettingSpec): spec is Extract<SectionSettingSpec, { kind: EditKind }> =>
  spec.kind === 'string' || spec.kind === 'text' || spec.kind === 'richtext';

const targetOf = (field: SectionField): EditTarget | null => {
  const spec = field.setting;
  return isEditableSpec(spec) && spec.inlineEdit === true ? { kind: spec.kind, label: field.label } : null;
};

// id настроек блока: флаг у всех типов блока, где есть настройка с этим id (как richtextIdsOf в set-html.ts).
const blockTargetsOf = (blocks: SectionManifest['blocks']): Map<string, EditTarget> => {
  const types = Object.values(blocks ?? {});
  const ids = new Set(types.flatMap((type) => type.settings.map((field) => field.id)));
  const targets = new Map<string, EditTarget>();
  for (const id of ids) {
    const found = types
      .flatMap((type) => type.settings.filter((field) => field.id === id))
      .map((field) => targetOf(field));
    if (found.length > 0 && found.every((target) => target !== null)) targets.set(id, found[0]);
  }
  return targets;
};

// settingFieldsOf для settings: поле с флагом и видом string, text или richtext; ссылки на общие настройки пропускает.
export function editTargetsOf(manifest: Pick<SectionManifest, 'settings' | 'blocks'>): EditTargets {
  const section = new Map<string, EditTarget>();
  for (const field of settingFieldsOf(manifest.settings)) {
    const target = targetOf(field);
    if (target !== null) section.set(field.id, target);
  }
  return { section, block: blockTargetsOf(manifest.blocks) };
}

export interface EditMarks {
  inserts: Insert[]; // по возрастанию at
  problems: SectionProblem[]; // inline-edit-unavailable, места — по исходному тексту
}

const TEXT_MESSAGE = (path: string, id: string, label: string): string =>
  `правка в превью: у настройки «${label}» (${id}) нет места — нужен элемент, всё содержимое которого — {${path}.${id}}`;
const HTML_MESSAGE = (path: string, id: string, label: string): string =>
  `правка в превью: у настройки «${label}» (${id}) нет места — нужен элемент с set:html={${path}.${id}} и без другого содержимого`;

// Ключ свойства: obj.key или obj['key']; остальное — пустая строка.
const keyOf = (member: AstNode): string => {
  const property = fieldOf(member, 'property');
  if (!isNode(property)) return '';
  if (fieldOf(member, 'computed') !== true) return identifierOf(property);
  if (property.type !== 'Literal') return '';
  return stringOf(fieldOf(property, 'value'));
};

// Элемент HTML: JSXElement с именем тега со строчной буквы (как rootElementOf в marks.ts).
const isHtmlElement = (node: AstNode): boolean => {
  if (node.type !== 'JSXElement') return false;
  const opening = fieldOf(node, 'openingElement');
  const name = isNode(opening) ? fieldOf(opening, 'name') : undefined;
  return isNode(name) && name.type === 'JSXIdentifier' && /^[a-z]/.test(stringOf(fieldOf(name, 'name')));
};

const isWhitespaceText = (child: unknown): boolean => {
  if (isNode(child)) return child.type === 'JSXText' && stringOf(fieldOf(child, 'value')).trim() === '';
  return typeof child === 'string' && child.trim() === '';
};

// Содержимое элемента без пробельных текстовых узлов.
const contentOf = (element: AstNode): unknown[] => {
  const children = fieldOf(element, 'children');
  return (Array.isArray(children) ? children : []).filter((child) => !isWhitespaceText(child));
};

// Единственное выражение содержимого — MemberExpression; иначе null (не место правки вида string и text).
const singleExpressionOf = (element: AstNode): AstNode | null => {
  const children = contentOf(element);
  if (children.length !== 1) return null;
  const [only] = children;
  if (!isNode(only) || only.type !== 'JSXExpressionContainer') return null;
  const expression = fieldOf(only, 'expression');
  return isMember(expression) ? expression : null;
};

// Имя атрибута JSX: set:html — JSXNamespacedName, остальное — JSXIdentifier (как в set-html.ts).
const attributeName = (node: AstNode): string => {
  const name = fieldOf(node, 'name');
  if (!isNode(name)) return '';
  if (name.type !== 'JSXNamespacedName') return stringOf(fieldOf(name, 'name'));
  const part = (value: unknown): string => (isNode(value) ? stringOf(fieldOf(value, 'name')) : '');
  return `${part(fieldOf(name, 'namespace'))}:${part(fieldOf(name, 'name'))}`;
};

// Значение единственного атрибута set:html у элемента без содержимого; иначе null (не место правки вида richtext).
const setHtmlExpressionOf = (element: AstNode): AstNode | null => {
  if (contentOf(element).length !== 0) return null;
  const opening = fieldOf(element, 'openingElement');
  const attributes = isNode(opening) ? fieldOf(opening, 'attributes') : undefined;
  const html = (Array.isArray(attributes) ? attributes : [])
    .filter(isNode)
    .filter((attribute) => attribute.type === 'JSXAttribute' && attributeName(attribute) === 'set:html');
  if (html.length !== 1) return null;
  const value = fieldOf(html[0], 'value');
  if (!isNode(value) || value.type !== 'JSXExpressionContainer') return null;
  const expression = fieldOf(value, 'expression');
  return isMember(expression) ? expression : null;
};

const sectionExpression = (expression: AstNode, id: string): boolean =>
  identifierOf(fieldOf(expression, 'object')) === 'settings' && keyOf(expression) === id;

const blockExpression = (expression: AstNode, param: string, id: string): boolean => {
  const object = fieldOf(expression, 'object');
  return (
    isMember(object) &&
    identifierOf(fieldOf(object, 'object')) === param &&
    keyOf(object) === 'settings' &&
    keyOf(expression) === id
  );
};

// Стрелка blocks.map: её тело (границы в тексте) и имя первого параметра — блок.
interface BlockMap {
  param: string;
  start: number;
  end: number;
}

const blockMapsOf = (nodes: readonly AstNode[]): BlockMap[] =>
  nodes
    .filter((node) => node.type === 'CallExpression' && blocksMapCall(node))
    .map((call) => firstOf(fieldOf(call, 'arguments')))
    .filter((arrow): arrow is AstNode => isNode(arrow) && arrow.type === 'ArrowFunctionExpression')
    .map((arrow) => ({ param: identifierOf(firstOf(fieldOf(arrow, 'params'))), start: arrow.start, end: arrow.end }))
    .filter((map) => map.param !== '');

// Самый внутренний blocks.map, внутри которого стоит элемент; нет — null.
const mapOf = (maps: readonly BlockMap[], element: AstNode): BlockMap | null => {
  const containing = maps
    .filter((map) => element.start >= map.start && element.end <= map.end)
    .sort((left, right) => left.end - left.start - (right.end - right.start));
  return containing[0] ?? null;
};

// Подпись и id — литерал в шаблоне: JSON-строка, в которой знаки <, >, {, }, & и разделители строк U+2028/U+2029
// записаны как обратная косая черта + u + четыре hex-цифры. Обратную косую черту собираем кодом, не литералом.
const BACKSLASH = String.fromCharCode(92);
const HEX_CODES: Readonly<Record<string, string>> = { '<': '003c', '>': '003e', '{': '007b', '}': '007d', '&': '0026' };

const hexCodeOf = (char: string): string | null => {
  if (HEX_CODES[char] !== undefined) return HEX_CODES[char];
  const code = char.codePointAt(0) ?? 0;
  return code === 0x2028 || code === 0x2029 ? code.toString(16).padStart(4, '0') : null;
};

const escapedLiteral = (value: string): string =>
  [...JSON.stringify(value)]
    .map((char) => {
      const hex = hexCodeOf(char);
      return hex === null ? char : BACKSLASH + 'u' + hex;
    })
    .join('');

// Вставка в открывающий тег: атрибут правки и подсказка пустого элемента (Р1-6-3).
const editInsert = (kind: EditKind, param: string | null, id: string, label: string): string => {
  const attribute = kind === 'richtext' ? 'data-merfy-edit-html' : 'data-merfy-edit';
  const call = param === null ? `edit(${escapedLiteral(id)})` : `edit(${param}, ${escapedLiteral(id)})`;
  return ` ${attribute}={Astro.props.__merfy.${call}} data-merfy-placeholder={Astro.props.__merfy.hint(${escapedLiteral(label)})}`;
};

const insertAt = (element: AstNode): number => {
  const opening = fieldOf(element, 'openingElement');
  const name = isNode(opening) ? fieldOf(opening, 'name') : undefined;
  return isNode(name) ? name.end : -1;
};

interface PendingEdit {
  scope: 'section' | 'block';
  id: string;
  target: EditTarget;
}

// Вставка для подходящего элемента: содержимое элемента — выражение нужного пути или set:html с ним (Р1-6-2).
const matchOf = (element: AstNode, entry: PendingEdit, maps: readonly BlockMap[]): Insert | null => {
  const expression = entry.target.kind === 'richtext' ? setHtmlExpressionOf(element) : singleExpressionOf(element);
  if (expression === null) return null;
  const at = insertAt(element);
  if (at < 0) return null;
  if (entry.scope === 'section') {
    return sectionExpression(expression, entry.id)
      ? { at, text: editInsert(entry.target.kind, null, entry.id, entry.target.label) }
      : null;
  }
  const map = mapOf(maps, element);
  if (map === null || !blockExpression(expression, map.param, entry.id)) return null;
  return { at, text: editInsert(entry.target.kind, map.param, entry.id, entry.target.label) };
};

// Место ошибки: первое вхождение пути в тексте; настройки в шаблоне нет совсем — места нет.
const needleOf = (text: string, entry: PendingEdit, params: readonly string[]): string | null => {
  if (entry.scope === 'section') return text.includes(`settings.${entry.id}`) ? `settings.${entry.id}` : null;
  const found = params.find((param) => text.includes(`${param}.settings.${entry.id}`));
  return found === undefined ? null : `${found}.settings.${entry.id}`;
};

// Путь в тексте ошибки: у блока — имя параметра стрелки blocks.map, вне её — block.settings.
const pathOf = (entry: PendingEdit, params: readonly string[]): string =>
  entry.scope === 'section' ? 'settings' : `${params[0] ?? 'block'}.settings`;

// Метки подходящих элементов: первый подходящий элемент по тексту (Р1-6-2).
const collectMatches = (
  element: AstNode,
  pending: readonly PendingEdit[],
  found: Set<PendingEdit>,
  inserts: Insert[],
  maps: readonly BlockMap[],
): void => {
  for (const entry of pending) {
    if (found.has(entry)) continue;
    const match = matchOf(element, entry, maps);
    if (match === null) continue;
    inserts.push(match);
    found.add(entry);
  }
};

const unavailableProblem = (text: string, entry: PendingEdit, params: readonly string[]): SectionProblem => {
  const needle = needleOf(text, entry, params);
  const message =
    entry.target.kind === 'richtext'
      ? HTML_MESSAGE(pathOf(entry, params), entry.id, entry.target.label)
      : TEXT_MESSAGE(pathOf(entry, params), entry.id, entry.target.label);
  return problem(
    'inline-edit-unavailable',
    TEMPLATE_FILE,
    message,
    needle === null ? undefined : positionAt(text, text.indexOf(needle)),
  );
};

export async function markEdits(text: string, targets: EditTargets): Promise<EditMarks> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  const nodes = nodesOf(ast);
  const maps = blockMapsOf(nodes);
  const params = [...new Set(maps.map((map) => map.param))];
  const elements = nodes.filter(isHtmlElement).sort((left, right) => left.start - right.start);
  const pending: PendingEdit[] = [
    ...[...targets.section].map(([id, target]) => ({ scope: 'section' as const, id, target })),
    ...[...targets.block].map(([id, target]) => ({ scope: 'block' as const, id, target })),
  ];
  const inserts: Insert[] = [];
  const found: Set<PendingEdit> = new Set();
  for (const element of elements) collectMatches(element, pending, found, inserts, maps);
  const problems = pending.filter((entry) => !found.has(entry)).map((entry) => unavailableProblem(text, entry, params));
  return { inserts: inserts.sort((left, right) => left.at - right.at), problems };
}
