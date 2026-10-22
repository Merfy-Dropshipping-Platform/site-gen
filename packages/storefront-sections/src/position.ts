import { findNodeAtLocation, parseTree } from 'jsonc-parser';

// Место в файле — строка и колонка с 1, как в редакторе. Считается по смещению символа в тексте.
export interface Position {
  line: number;
  column: number;
}

export function positionAt(text: string, offset: number): Position {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

// Место значения в тексте JSON по пути к нему: строка и колонка первого знака значения ({, [, " или цифры).
// Текст не JSON или пути нет — undefined. parseTree и findNodeAtLocation из jsonc-parser, место — positionAt.
export function valuePosition(text: string, path: readonly (string | number)[]): Position | undefined {
  const root = parseTree(text);
  if (root === undefined) return undefined;
  const node = findNodeAtLocation(root, [...path]);
  if (node === undefined) return undefined;
  return positionAt(text, node.offset);
}
