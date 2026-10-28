import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { bindingNames, type Found } from './expressions';
import { settingFieldsOf, type SectionField } from './fields';
import { isInlineTextSpec } from './inline-text';
import type { SectionManifest } from './format';

// set:html в шаблоне секции (блок 1 «Секций и SDK», часть 3, Р58): Astro вставляет значение как HTML, без
// экранирования. Можно только с настройкой вида richtext — её значение очищено (richtext.ts): settings.<id> настройки
// секции или <блок>.settings.<id>, где <блок> — первый параметр стрелки в blocks.map(...), а <id> — richtext у каждого
// типа блока, где он есть. Запрет консервативный: имя settings, связанное параметром стрелки, или имя блока, связанное
// ещё где-то, — отказ: по дереву не видно, что за значение под этим именем. Блок 8, часть 8г-2: ещё HTML записи —
// page.record.html и settings.<id>.html поля вида policy (recordHtmlAllowed). Базовые секции, этап 0 (E14): так же — поле
// с начертаниями (string и text с ai): его значение очищено до <em> и <strong> (inline-text.ts). В RichtextIds — id обоих.
export interface RichtextIds {
  section: ReadonlySet<string>;
  block: ReadonlySet<string>;
  // Блок 8, часть 8г-2: id полей вида policy секции — у них можно settings.<id>.html (текст политики экранирован).
  html?: ReadonlySet<string>;
}

export const NO_RICHTEXT: RichtextIds = { section: new Set(), block: new Set() };
export const SET_HTML_TEXT =
  'set:html можно только с настройкой вида richtext, string или text с ai, page.record.html или settings.<id>.html поля вида policy';

type Fields = SectionManifest['settings'];

// Значение поля — очищенный HTML: richtext (richtext.ts) или текст с начертаниями (inline-text.ts).
const isHtmlField = (field: SectionField): boolean =>
  field.setting.kind === 'richtext' || isInlineTextSpec(field.setting);

const richtextOf = (fields: Fields): string[] =>
  settingFieldsOf(fields)
    .filter(isHtmlField)
    .map((field) => field.id);

// id полей с HTML: у секции; у блоков — id, который во всех типах блока, где он есть, — поле с HTML.
export function richtextIdsOf(manifest: Pick<SectionManifest, 'settings' | 'blocks'>): RichtextIds {
  const types = Object.values(manifest.blocks ?? {});
  const ids = new Set(types.flatMap((type) => type.settings.map((field) => field.id)));
  const block = [...ids].filter((id) =>
    types.every((type) => type.settings.every((field) => field.id !== id || isHtmlField(field))),
  );
  const html = settingFieldsOf(manifest.settings)
    .filter((field) => field.setting.kind === 'policy')
    .map((field) => field.id);
  return {
    section: new Set(richtextOf(manifest.settings)),
    block: new Set(block),
    ...(html.length === 0 ? {} : { html: new Set(html) }),
  };
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const identifierOf = (value: unknown): string =>
  isNode(value) && value.type === 'Identifier' ? stringOf(fieldOf(value, 'name')) : '';
const isMember = (value: unknown): value is AstNode => isNode(value) && value.type === 'MemberExpression';

// Ключ свойства: obj.key или obj['key']; остальное — пустая строка.
function keyOf(member: AstNode): string {
  const property = fieldOf(member, 'property');
  if (!isNode(property)) return '';
  if (fieldOf(member, 'computed') !== true) return identifierOf(property);
  if (property.type !== 'Literal') return '';
  return stringOf(fieldOf(property, 'value'));
}

// Имя атрибута JSX: set:html — JSXNamespacedName, остальное — JSXIdentifier.
function attributeName(node: AstNode): string {
  const name = fieldOf(node, 'name');
  if (!isNode(name)) return '';
  if (name.type !== 'JSXNamespacedName') return stringOf(fieldOf(name, 'name'));
  const part = (value: unknown): string => (isNode(value) ? stringOf(fieldOf(value, 'name')) : '');
  return `${part(fieldOf(name, 'namespace'))}:${part(fieldOf(name, 'name'))}`;
}

// Стрелка — первый аргумент blocks.map(...)?
function isBlocksMapArrow(call: AstNode): AstNode | null {
  const callee = fieldOf(call, 'callee');
  const args = fieldOf(call, 'arguments');
  const arrow: unknown = Array.isArray(args) ? args[0] : undefined;
  if (!isMember(callee) || identifierOf(fieldOf(callee, 'object')) !== 'blocks' || keyOf(callee) !== 'map') return null;
  if (fieldOf(callee, 'computed') === true) return null;
  return isNode(arrow) && arrow.type === 'ArrowFunctionExpression' ? arrow : null;
}

interface Scope {
  settingsBound: boolean;
  blocksBound: boolean;
  // Блок 8, часть 8г-2: имя page связано параметром стрелки — page.record.html не разрешаем.
  pageBound: boolean;
  blockParams: ReadonlySet<string>;
}

// Имена параметров одной стрелки: первый параметр blocks.map — имя блока (asBlock), встреченное ещё где-то — elsewhere.
function namesOf(arrow: AstNode, mapFirst: ReadonlySet<unknown>, asBlock: Set<string>, elsewhere: Set<string>): void {
  const params = fieldOf(arrow, 'params');
  for (const param of Array.isArray(params) ? params : []) {
    const target = mapFirst.has(param) ? asBlock : elsewhere;
    for (const name of bindingNames(param)) target.add(name);
  }
}

// Какие имена связаны параметрами стрелок: settings и blocks — хоть где-то; имя блока — только первым параметром
// стрелки в blocks.map, нигде больше.
function scopeOf(nodes: readonly AstNode[]): Scope {
  const mapFirst = new Set<unknown>();
  for (const call of nodes.filter((node) => node.type === 'CallExpression')) {
    const arrow = isBlocksMapArrow(call);
    const params = arrow === null ? undefined : fieldOf(arrow, 'params');
    const first: unknown = Array.isArray(params) ? params[0] : undefined;
    if (isNode(first) && first.type === 'Identifier') mapFirst.add(first);
  }
  const asBlock = new Set<string>();
  const elsewhere = new Set<string>();
  const arrows = nodes.filter((node) => node.type === 'ArrowFunctionExpression');
  for (const arrow of arrows) namesOf(arrow, mapFirst, asBlock, elsewhere);
  const all = new Set([...asBlock, ...elsewhere]);
  return {
    settingsBound: all.has('settings'),
    blocksBound: all.has('blocks'),
    pageBound: all.has('page'),
    blockParams: new Set([...asBlock].filter((name) => !elsewhere.has(name))),
  };
}

// HTML записи (блок 8, часть 8г-2; Р8г-7): page.record.html — текст статьи, очищенный сборщиком, или политики с
// экранированием; settings.<id>.html — у поля вида policy. Имена page и settings не связаны параметрами стрелок.
function recordHtmlAllowed(expression: AstNode, ids: RichtextIds, scope: Scope): boolean {
  const object = fieldOf(expression, 'object');
  if (keyOf(expression) !== 'html' || !isMember(object)) return false;
  const owner = identifierOf(fieldOf(object, 'object'));
  if (owner === 'page') return !scope.pageBound && keyOf(object) === 'record';
  return owner === 'settings' && !scope.settingsBound && (ids.html?.has(keyOf(object)) ?? false);
}

// Значение атрибута — {settings.<richtext>}, {<блок>.settings.<richtext>} или HTML записи (recordHtmlAllowed).
function allowed(value: unknown, ids: RichtextIds, scope: Scope): boolean {
  if (!isNode(value) || value.type !== 'JSXExpressionContainer') return false;
  const expression = fieldOf(value, 'expression');
  if (!isMember(expression)) return false;
  if (recordHtmlAllowed(expression, ids, scope)) return true;
  const id = keyOf(expression);
  const object = fieldOf(expression, 'object');
  if (identifierOf(object) === 'settings') return !scope.settingsBound && ids.section.has(id);
  if (!isMember(object) || keyOf(object) !== 'settings') return false;
  const param = identifierOf(fieldOf(object, 'object'));
  return !scope.blocksBound && scope.blockParams.has(param) && ids.block.has(id);
}

// Запреты set:html по дереву разбора: место атрибута и текст.
export function setHtmlFound(root: unknown, ids: RichtextIds): Found[] {
  const nodes = nodesOf(root);
  const scope = scopeOf(nodes);
  return nodes
    .filter((node) => node.type === 'JSXAttribute' && attributeName(node) === 'set:html')
    .filter((node) => !allowed(fieldOf(node, 'value'), ids, scope))
    .map((node) => ({ at: node.start, message: SET_HTML_TEXT }));
}
