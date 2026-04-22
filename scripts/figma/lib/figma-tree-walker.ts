import type { FigmaNode } from './types.js';

export interface WalkYield {
  node: FigmaNode;
  depth: number;
  parentChain: string[]; // names of parents from top down
}

/**
 * Yield FRAME/SECTION/COMPONENT/INSTANCE nodes DFS.
 * Skips deep drill into nodes we already classified (caller controls via `skipChildrenOf`).
 */
export function* walkFrames(
  root: FigmaNode,
  opts: {
    maxDepth?: number;
    includeTypes?: string[];
    skipChildrenOf?: Set<string>;
  } = {},
): Generator<WalkYield, void, unknown> {
  const include =
    opts.includeTypes ?? ['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'];
  const max = opts.maxDepth ?? 10;

  const stack: { node: FigmaNode; depth: number; parentChain: string[] }[] = [
    { node: root, depth: 0, parentChain: [] },
  ];

  while (stack.length > 0) {
    const { node, depth, parentChain } = stack.pop()!;

    if (depth > 0 && include.includes(node.type)) {
      yield { node, depth, parentChain };
    }

    if (depth >= max) continue;
    if (opts.skipChildrenOf?.has(node.id)) continue;

    const children = node.children ?? [];
    // push in reverse so we process in document order
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i],
        depth: depth + 1,
        parentChain: [...parentChain, node.name],
      });
    }
  }
}

/** Collect all TEXT nodes under a subtree (depth-first). */
export function* walkTextNodes(root: FigmaNode): Generator<FigmaNode, void, unknown> {
  if (root.type === 'TEXT') {
    yield root;
  }
  for (const child of root.children ?? []) {
    yield* walkTextNodes(child);
  }
}

/** Find first ancestor or self matching predicate (walking up would need parent pointers we don't keep; instead search tree). */
export function findNodeById(root: FigmaNode, id: string): FigmaNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}
