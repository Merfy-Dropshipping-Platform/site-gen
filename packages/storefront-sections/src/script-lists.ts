import type { NodePath } from '@babel/traverse';
import type { Node } from '@babel/types';
import { argsOf, child, isCall, isMember, memberKey, unwrap } from './script-attrs';
import { staticKey } from './script-tree';

// Вызов El.list в коде секции и ref, на котором его вызвали (design.md блока 5, раздел 3.9). Ядро витрины копирует
// содержимое дочернего <template> элемента (storefront-shell, core/el.ts: templateOf); без него list падает в браузере
// покупателя. Здесь находится вызов и имя ref — сверку с шаблоном делает script-names.ts (list-template-missing).
// Формы вызова: x.list(…), x?.list(…), x['list'](…), x.list?.(…), x.list.call(x, …), x.list.apply(x, […]), псевдоним
// const put = x.list / x.list.bind(x), деструктуризация const { list } = x. Откуда взят x: …ref('имя') или
// …closest('имя') с именем строкой, а также const-имя, которому он присвоен. Имя из вычисления при сохранении не известно.
const MAX_DEPTH = 4;
const REF_METHODS: ReadonlySet<string> = new Set(['ref', 'closest']);
const LIST = 'list';

export interface ListCall {
  // Имя ref: data-ref="…" элемента, у которого вызвали list.
  readonly ref: string;
  // Узел для места: слово list; у псевдонима и деструктуризации — вызываемое имя.
  readonly at: Node;
}

interface Holder {
  // Выражение El, у которого вызывают list.
  readonly el: NodePath;
  // Слово list в вызове; у псевдонима — null.
  readonly word: Node | null;
}

// Строка в коде: 'имя', "имя" или `имя` без вставок.
function textOf(path: NodePath | undefined): string | null {
  if (path === undefined) return null;
  if (path.isStringLiteral()) return path.node.value;
  if (path.isTemplateLiteral() && path.node.expressions.length === 0) return path.node.quasis[0]?.value.cooked ?? null;
  return null;
}

// Что присвоено const-имени: объявление с простым именем и неизменным значением.
function declaratorOf(path: NodePath): NodePath | null {
  if (!path.isIdentifier()) return null;
  const binding = path.scope.getBinding(path.node.name);
  return binding !== undefined && binding.constant && binding.path.isVariableDeclarator() ? binding.path : null;
}

// Имя ref, которое вернул вызов …ref('имя') / …closest('имя'); const с таким вызовом — по его объявлению.
function refNameOf(path: NodePath, depth: number): string | null {
  if (depth > MAX_DEPTH) return null;
  const node = unwrap(path);
  if (isCall(node)) {
    const callee = child(node, 'callee');
    const method = callee !== null && isMember(callee) ? memberKey(callee) : null;
    return method !== null && REF_METHODS.has(method) ? textOf(argsOf(node)[0]) : null;
  }
  const declarator = declaratorOf(node);
  const init = declarator === null ? null : child(declarator, 'init');
  const simple = declarator?.node.type === 'VariableDeclarator' && declarator.node.id.type === 'Identifier';
  return init === null || !simple ? null : refNameOf(init, depth + 1);
}

// Имя, которое деструктуризация вводит: { list }, { list: put }, { list = f }.
function boundName(value: Node): string | null {
  if (value.type === 'Identifier') return value.name;
  return value.type === 'AssignmentPattern' && value.left.type === 'Identifier' ? value.left.name : null;
}

// const { list } = x; const { list: put } = x → x.
function destructured(path: NodePath): NodePath | null {
  const declarator = declaratorOf(path);
  if (declarator === null || !declarator.isVariableDeclarator() || !path.isIdentifier()) return null;
  const id = declarator.node.id;
  if (id.type !== 'ObjectPattern') return null;
  const found = id.properties.some(
    (item) =>
      item.type === 'ObjectProperty' &&
      boundName(item.value) === path.node.name &&
      staticKey(item.key, item.computed) === LIST,
  );
  return found ? child(declarator, 'init') : null;
}

// const put = x.list; const put = x.list.bind(x) → владелец метода.
function aliased(path: NodePath, depth: number): Holder | null {
  const declarator = declaratorOf(path);
  const init = declarator === null ? null : child(declarator, 'init');
  if (declarator === null || init === null || declarator.node.type !== 'VariableDeclarator') return null;
  if (declarator.node.id.type !== 'Identifier') return null;
  const value = unwrap(init);
  if (isCall(value)) {
    const callee = child(value, 'callee');
    const bound = callee !== null && isMember(callee) && memberKey(callee) === 'bind';
    const object = bound ? child(callee, 'object') : null;
    return object === null ? null : holderOf(object, depth + 1);
  }
  return holderOf(value, depth + 1);
}

// Чьё слово list вызывают: x.list, x.list.call, x.list.apply, псевдоним и деструктуризация.
function holderOf(callee: NodePath, depth = 0): Holder | null {
  if (depth > MAX_DEPTH) return null;
  const path = unwrap(callee);
  if (path.isIdentifier()) {
    const owner = destructured(path);
    return owner === null ? aliased(path, depth) : { el: owner, word: null };
  }
  if (!isMember(path)) return null;
  const key = memberKey(path);
  const object = child(path, 'object');
  if (object === null) return null;
  if (key === LIST) {
    const property =
      path.node.type === 'MemberExpression' || path.node.type === 'OptionalMemberExpression'
        ? path.node.property
        : null;
    return { el: object, word: property };
  }
  return key === 'call' || key === 'apply' ? holderOf(object, depth + 1) : null;
}

// El.list в вызове call или null: ref известен из кода, остальное (list у чужого объекта, имя ref из вычисления) не судим.
export function listCallOf(call: NodePath): ListCall | null {
  const callee = child(call, 'callee');
  const holder = callee === null ? null : holderOf(callee);
  const ref = holder === null ? null : refNameOf(holder.el, 0);
  if (callee === null || holder === null || ref === null) return null;
  return { ref, at: holder.word ?? unwrap(callee).node };
}
