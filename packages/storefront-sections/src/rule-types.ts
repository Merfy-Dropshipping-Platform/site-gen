import type { OwnNames } from './names';
import type { ProblemCode } from './problems';

// Секция глазами правил полей (блок 3 «Секций и SDK»): списки полей — свой у секции и у каждого типа блока — и типы
// блоков. Путь — до значения в section.json: по нему position.ts находит строку и колонку.
export type JsonPath = readonly (string | number)[];

export interface RuleField {
  id: string;
  label: string;
  sublabel?: string;
  section?: string;
  row?: string;
  visibleWhen?: { setting: string; equals: string | boolean };
  disabledWhen?: { setting: string; equals: string | boolean };
  setting: { kind: string; default?: unknown; options?: readonly { value: string; label: string }[] };
}

export interface FieldList {
  of: 'section' | 'block';
  path: JsonPath;
  // Чей список — в тексте ошибки: «секции», «блока `slide`».
  owner: string;
  fields: readonly RuleField[];
}

export interface BlockType {
  type: string;
  title: string;
  limit: number;
}

export interface RuleSection {
  lists: readonly FieldList[];
  // Раздел `names` из section.json: свои имена секции.
  ownNames?: OwnNames;
  blocks: readonly BlockType[];
}

export interface FieldIssue {
  code: ProblemCode;
  path: JsonPath;
  message: string;
}
