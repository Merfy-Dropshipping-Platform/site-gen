import { BEHAVIORS, PRESETS, PRESET_PARAMS } from '@merfy/shell/behaviors/catalog';

// behaviors.md (блок 14): поведения data-behavior и пресеты data-animate из каталога SDK.
interface ParamSpec {
  readonly kind: string;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default: unknown;
}

const valuesOf = (value: object): readonly string[] | undefined => {
  const values: unknown = Reflect.get(value, 'values');
  return Array.isArray(values) ? values.map(String) : undefined;
};

const numberOrUndefined = (value: object, key: string): number | undefined => {
  const num: unknown = Reflect.get(value, key);
  return typeof num === 'number' ? num : undefined;
};

const specOf = (value: unknown): ParamSpec | null => {
  if (typeof value !== 'object' || value === null) return null;
  const kind: unknown = Reflect.get(value, 'kind');
  if (typeof kind !== 'string') return null;
  return {
    kind,
    values: valuesOf(value),
    min: numberOrUndefined(value, 'min'),
    max: numberOrUndefined(value, 'max'),
    default: Reflect.get(value, 'default'),
  };
};

const paramText = (spec: ParamSpec): string => {
  const def = Array.isArray(spec.default) ? spec.default.join(', ') : String(spec.default);
  if (spec.kind === 'enum') return `одно из: ${(spec.values ?? []).join(', ')}; по умолчанию \`${def}\``;
  if (spec.kind === 'int') return `целое от ${spec.min ?? 0} до ${spec.max ?? 0}; по умолчанию \`${def}\``;
  if (spec.kind === 'bool') return `да или нет; по умолчанию \`${def}\``;
  if (spec.kind === 'list') return `список через запятую; по умолчанию \`${def}\``;
  return `строка${spec.default === null ? '' : `; по умолчанию \`${def}\``}`;
};

const paramsOf = (params: Readonly<Record<string, unknown>>): string => {
  const entries = Object.entries(params).map(([name, spec]) => {
    const parsed = specOf(spec);
    return parsed === null ? `\`data-${name}\`` : `\`data-${name}\` — ${paramText(parsed)}`;
  });
  return entries.length === 0 ? '—' : entries.join('; ');
};

export function behaviorsPage(): string {
  const behaviors = Object.entries(BEHAVIORS).map(([name, spec]) => {
    const parts = spec.parts.length === 0 ? '—' : spec.parts.map((part) => `\`data-part="${part}"\``).join(', ');
    return `## ${name}\n\nЧасти: ${parts}.\n\nПараметры: ${paramsOf(spec.params)}.`;
  });
  const presetNames = Object.keys(PRESETS)
    .map((name) => `\`${name}\``)
    .join(', ');
  return [
    'Готовое поведение вешается на элемент атрибутом `data-behavior="<имя>"` — без скрипта. Части поведения отмечаются `data-part`, параметры — своими `data-…` на том же элементе.',
    '',
    ...behaviors,
    '',
    '## Пресеты data-animate',
    '',
    `Пресет указывается в \`data-animate="<имя>"\`: ${presetNames}.`,
    '',
    `Параметры пресета: ${paramsOf(PRESET_PARAMS)}.`,
  ].join('\n');
}
