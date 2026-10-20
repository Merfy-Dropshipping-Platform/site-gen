// Узлы дерева разбора @astrojs/compiler-rs — обычные объекты JSON: тип, место в тексте шаблона (start и end — индексы
// знаков строки JS) и поля узла. Обход — стеком, без рекурсии: глубина шаблона не ограничена.
export interface AstNode {
  type: string;
  start: number;
  end: number;
}

export const fieldOf = (node: AstNode, name: string): unknown => Reflect.get(node, name);

export const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'type') === 'string' &&
  typeof Reflect.get(value, 'start') === 'number';

// Все узлы дерева: корень и узлы во всех полях, в том числе в массивах. Объект, встреченный второй раз, не обходится.
export function nodesOf(root: unknown): AstNode[] {
  const found: AstNode[] = [];
  const seen = new WeakSet<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null || seen.has(value)) continue;
    seen.add(value);
    if (isNode(value)) found.push(value);
    const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
    for (const child of children.reverse()) stack.push(child);
  }
  return found;
}
