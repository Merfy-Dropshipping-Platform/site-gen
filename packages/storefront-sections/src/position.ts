// Место в файле — строка и колонка с 1, как в редакторе. Считается по смещению символа в тексте.
export interface Position {
  line: number;
  column: number;
}

export function positionAt(text: string, offset: number): Position {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
