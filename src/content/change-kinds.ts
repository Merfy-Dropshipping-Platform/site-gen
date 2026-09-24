/**
 * Какие изменения документа — правка мерчанта, а какие — производные
 * (этап 2, дополнение главного агента). Правила модели документа, не движка:
 * движок операций о секциях, шапках и панели конструктора не знает.
 *
 *  - Автозначение панели. Конструктор при правке одного поля секции пишет в
 *    блок `{...defaultProps, ...existingProps, [field]: value}`
 *    (CustomFieldsPanel `updateProp`), то есть вписывает значения по умолчанию
 *    панели в ключи, которых в секции не было. Ключ, появившийся со значением
 *    по умолчанию панели (или пропавший, имея его), — не правка: он не спорит
 *    при слиянии, не применяется поверх чужого и не попадает в `meta.changes`.
 *  - Копия служебного блока (шапка, подвал, промо-баннер, шапка чекаута) на
 *    внутренней странице — её раскатывают с главной конструктор
 *    (`syncSharedSections`) и чтение (`unifyHeaderWithHome`); в `meta` она
 *    считается отдельно, правкой мерчанта остаётся правка на главной.
 */
import { parseSegment, splitPath } from "./operations/address";
import { deepEqual, isPlainObject } from "./operations/json";
import { readAt } from "./operations";
import type { Doc, Op } from "./operations";
import { CHROME_TYPES } from "../utils/revision-write-filter";

/** Значения по умолчанию панели: тип секции → её `defaultProps`. */
export type PanelDefaults = Readonly<Record<string, Record<string, unknown>>>;

/** Страница, с которой раскатываются служебные блоки. */
const HOME_PAGE = "home";

interface BlockAt {
  pageId: string;
  /** Адрес секции: `page:<id>/block:<id>` (или внутри зоны). */
  blockPath: string;
  /** Путь внутри `props`; `null` — адрес не в свойствах секции. */
  propKeys: string[] | null;
}

function keyOf(segment: string): string | null {
  const parsed = parseSegment(segment);
  return parsed.kind === "key" ? parsed.key : null;
}

/** Секция, внутри которой лежит адрес, — или `null`, если адрес не про секцию. */
function blockAt(path: string): BlockAt | null {
  const segments = splitPath(path);
  const page = parseSegment(segments[0] ?? "");
  const at = segments.findIndex((s) => s.startsWith("block:"));
  if (page.kind !== "prefixed" || page.prefix !== "page:" || at < 0)
    return null;
  const [head, ...rest] = segments.slice(at + 1);
  const keys = rest.map(keyOf);
  const inProps = head === "props" && keys.every((k) => k !== null);
  return {
    pageId: page.id,
    blockPath: segments.slice(0, at + 1).join("/"),
    propKeys: inProps ? keys : null,
  };
}

/** Тип секции по первому документу, где она есть. */
function blockTypeIn(
  blockPath: string,
  docs: readonly Doc[],
): string | undefined {
  const block = docs.map((d) => readAt(d, blockPath)).find(isPlainObject);
  return typeof block?.type === "string" ? block.type : undefined;
}

function valueAtKeys(value: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>(
    (v, k) => (isPlainObject(v) ? v[k] : undefined),
    value,
  );
}

/** Для каких операций что значит «автозначение». Прочие операции — всегда правка. */
const AUTO_CHECKS: Partial<
  Record<Op["op"], (op: Op, base: Doc, fallback: unknown) => boolean>
> = {
  set: (op, base, fallback) =>
    op.op === "set" &&
    readAt(base, op.path) === undefined &&
    deepEqual(op.value, fallback),
  remove: (op, base, fallback) => deepEqual(readAt(base, op.path), fallback),
};

/**
 * Правило «автозначение панели» для темы: `(op, base, side)` — операция
 * `diff(base, side)`. Нет дефолтов (тема не загрузилась) — автозначений нет.
 */
export function makeAutoValueRule(defaults: PanelDefaults) {
  return (op: Op, base: Doc, side: Doc): boolean => {
    const at = blockAt(op.path);
    if (!at?.propKeys?.length) return false;
    const type = blockTypeIn(at.blockPath, [side, base]);
    const fallback =
      type === undefined ? undefined : valueAtKeys(defaults[type], at.propKeys);
    if (fallback === undefined) return false;
    return AUTO_CHECKS[op.op]?.(op, base, fallback) ?? false;
  };
}

/** Копия служебного блока на внутренней странице (тип ищется в переданных документах). */
export function isChromeCopy(op: Op, ...docs: Doc[]): boolean {
  const at = blockAt(op.path);
  if (!at || at.pageId === HOME_PAGE) return false;
  const type = blockTypeIn(at.blockPath, docs);
  return type !== undefined && CHROME_TYPES.has(type);
}
