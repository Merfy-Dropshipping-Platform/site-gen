/**
 * `merge3(base, current, incoming, policy)` — трёхстороннее слияние.
 *
 * 1. Правки сторон — `diff(base, current)` («чужие») и `diff(base, incoming)`
 *    («входящие»), по одному плану «одним значением» на все три документа.
 * 2. Спорное место — наименьший адрес, где чужая и входящая операции
 *    пересекаются. Если значения сторон там совпали — спора нет.
 * 3. Страница целиком (мета `pages/<id>` + содержимое `page:<id>`) спорится
 *    одной единицей: обе части берутся с одной стороны.
 * 4. Остальные входящие операции применяются к `current` как есть.
 * 5. Спорные места: `last-writer-wins` — ставится значение входящей стороны
 *    (секция возвращается на своё место, если чужая сторона её удалила);
 *    `reject-conflicts` — ничего не сливается.
 * В отчёт (`overwritten`/`conflicts`) попадают только места, которые чужая
 * сторона действительно меняла. Служебные поля (`VOLATILE_PATHS`) спорами не
 * бывают: берётся входящее значение, если входящая сторона его меняла.
 * Операции, которые модель документа считает не правкой (`options.isAuto`:
 * значения по умолчанию, вписанные редактором), не спорят и не применяются.
 */
import {
  ORDER_SEGMENT,
  covers,
  itemSegment,
  joinPath,
  parentPath,
  parseSegment,
  splitPath,
} from "./address";
import { apply } from "./apply";
import { atomicContainers, diffWithPlan } from "./diff";
import { deepEqual, orNull } from "./json";
import { VOLATILE_PATHS, idsOf } from "./shape";
import type {
  ContestedValue,
  Doc,
  MergePolicy,
  MergeResult,
  Op,
} from "./types";
import { coversPath, isOrderPath, locate, overlapsPath, readAt } from "./walk";

function isVolatile(op: Op): boolean {
  return VOLATILE_PATHS.some((path) => covers(path, op.path));
}

/** Наименьшие адреса, где пересеклись чужие и входящие операции. */
function contestedRegions(
  theirs: readonly Op[],
  ours: readonly Op[],
): string[] {
  const candidates = ours.flatMap((o) =>
    theirs
      .filter((t) => overlapsPath(t.path, o.path))
      .map((t) => (coversPath(t.path, o.path) ? t.path : o.path)),
  );
  const unique = [...new Set(candidates)];
  return unique.filter(
    (r) => !unique.some((other) => other !== r && coversPath(other, r)),
  );
}

/** Вторая половина страницы: `page:<id>` ↔ `pages/<id>`. */
function pageCounterpart(path: string): string | undefined {
  const segments = splitPath(path).map(parseSegment);
  const [first, second] = segments;
  if (
    segments.length === 1 &&
    first.kind === "prefixed" &&
    first.prefix === "page:"
  ) {
    return joinPath("pages", itemSegment("", first.id));
  }
  if (
    segments.length === 2 &&
    first.kind === "key" &&
    first.key === "pages" &&
    second.kind === "key"
  ) {
    return itemSegment("page:", second.key);
  }
  return undefined;
}

function differs(a: Doc, b: Doc) {
  return (path: string) => !deepEqual(readAt(a, path), readAt(b, path));
}

/** Спорные страницы целиком тянут за собой вторую половину, если она у сторон разная. */
function withPageCounterparts(
  contested: string[],
  current: Doc,
  incoming: Doc,
): string[] {
  const counterparts = contested
    .map(pageCounterpart)
    .filter((p): p is string => p !== undefined)
    .filter((p) => !contested.some((r) => coversPath(r, p)))
    .filter(differs(current, incoming));
  return [...contested, ...counterparts];
}

/** Операция, которая ставит в спорное место значение входящей стороны. */
function takeIncoming(path: string, current: Doc, incoming: Doc): Op {
  const value = readAt(incoming, path);
  if (isOrderPath(path))
    return { op: "order", path, ids: (value as string[] | undefined) ?? [] };
  if (value === undefined) return { op: "remove", path };
  const target = locate(incoming, path);
  const isNewItem =
    target?.kind === "item" && readAt(current, path) === undefined;
  if (!isNewItem) return { op: "set", path, value };
  const before = idsOf(
    target.shape,
    target.list.slice(0, target.index),
  ).reverse();
  return { op: "add", path, value, after: before };
}

const PHASE: Record<Op["op"], number> = { remove: 0, order: 1, add: 2, set: 3 };

/** Место вставки: индекс элемента во входящем списке (секции встают в его порядке). */
function rankIn(incoming: Doc, op: Op): number {
  if (op.op !== "add") return 0;
  const ids = readAt(incoming, joinPath(parentPath(op.path), ORDER_SEGMENT));
  const target = locate(incoming, op.path);
  return Array.isArray(ids) && target?.kind === "item" ? target.index : 0;
}

/** Порядок применения: удалить → порядок → вставить (во входящем порядке) → поставить. */
function inApplyOrder(ops: readonly Op[], incoming: Doc): Op[] {
  return ops
    .map((op, i) => ({
      op,
      i,
      phase: PHASE[op.op],
      rank: rankIn(incoming, op),
    }))
    .sort((x, y) => x.phase - y.phase || x.rank - y.rank || x.i - y.i)
    .map((x) => x.op);
}

function valuePair(current: Doc, incoming: Doc) {
  return (path: string): ContestedValue => ({
    path,
    current: orNull(readAt(current, path)),
    incoming: orNull(readAt(incoming, path)),
  });
}

export interface MergeOptions {
  /**
   * Операция `diff(base, side)`, которая не является правкой (например,
   * значение по умолчанию, вписанное редактором): она не спорит и не
   * применяется. Правило даёт модель документа, движок о нём не знает.
   */
  isAuto?: (op: Op, base: Doc, side: Doc) => boolean;
}

const NOTHING_IS_AUTO = () => false;

export function merge3(
  base: Doc,
  current: Doc,
  incoming: Doc,
  policy: MergePolicy,
  options: MergeOptions = {},
): MergeResult {
  const isAuto = options.isAuto ?? NOTHING_IS_AUTO;
  const plan = atomicContainers([base, current, incoming]);
  const theirs = diffWithPlan(base, current, plan).filter(
    (op) => !isVolatile(op) && !isAuto(op, base, current),
  );
  const ours = diffWithPlan(base, incoming, plan).filter(
    (op) => !isAuto(op, base, incoming),
  );

  const regions = contestedRegions(
    theirs,
    ours.filter((op) => !isVolatile(op)),
  );
  const contested = withPageCounterparts(
    regions.filter(differs(current, incoming)),
    current,
    incoming,
  );
  const disputes = contested
    .filter(differs(current, base))
    .map(valuePair(current, incoming));

  if (policy === "reject-conflicts" && disputes.length > 0) {
    return { merged: null, overwritten: [], conflicts: disputes, applied: [] };
  }

  const settled = [...regions, ...contested];
  const free = ours.filter(
    (op) => !settled.some((r) => coversPath(r, op.path)),
  );
  const resolved = contested.map((path) =>
    takeIncoming(path, current, incoming),
  );
  const applied = inApplyOrder([...free, ...resolved], incoming);
  return {
    merged: apply(current, applied),
    overwritten: policy === "last-writer-wins" ? disputes : [],
    conflicts: [],
    applied,
  };
}
