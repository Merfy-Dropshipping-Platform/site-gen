import type { ParamSpec } from './catalog';

// Чтение параметров поведения с его корня (design.md блока 6, раздел 1): значение — атрибут data-<имя>, разбор — по
// виду из каталога, результат заморожен и содержит только ключи из specs.
export type ParamValue = string | number | boolean | readonly string[] | null;
export type Params = Readonly<Record<string, ParamValue>>;

const INT = /^-?\d+$/;

const inBounds = (value: number, spec: Extract<ParamSpec, { kind: 'int' }>): number =>
  Math.min(spec.max, Math.max(spec.min, value));

const readInt = (raw: string, spec: Extract<ParamSpec, { kind: 'int' }>): number =>
  INT.test(raw) ? inBounds(Number(raw), spec) : spec.default;

const readBool = (raw: string, spec: Extract<ParamSpec, { kind: 'bool' }>): boolean => {
  if (raw === '' || raw === 'true') return true;
  if (raw === 'false') return false;
  return spec.default;
};

const readEnum = (raw: string, spec: Extract<ParamSpec, { kind: 'enum' }>): string =>
  spec.values.includes(raw) ? raw : spec.default;

const readList = (raw: string): readonly string[] => raw.split(/\s+/).filter((part) => part !== '');

// Разбор значения по виду параметра; тип string — значение как есть.
function readParamValue(raw: string, spec: ParamSpec): ParamValue {
  switch (spec.kind) {
    case 'enum':
      return readEnum(raw, spec);
    case 'int':
      return readInt(raw, spec);
    case 'bool':
      return readBool(raw, spec);
    case 'string':
      return raw;
    case 'list':
      return readList(raw);
  }
}

const readParam = (root: Element, name: string, spec: ParamSpec): ParamValue => {
  const raw = root.getAttribute(`data-${name}`);
  if (raw === null) {
    return spec.default;
  }
  return readParamValue(raw, spec);
};

export function readParams(root: Element, specs: Readonly<Record<string, ParamSpec>>): Params {
  const entries = Object.entries(specs).map(([name, spec]) => [name, readParam(root, name, spec)] as const);
  return Object.freeze(Object.fromEntries(entries));
}
