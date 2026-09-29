/**
 * `diff(base, next) → Op[]`: минимальные операции, превращающие `base` в `next`.
 *
 * Записи сравниваются поле за полем, списки с id — по id (удалить, порядок,
 * добавить, правка элемента — именно в таком порядке операций), словари — по
 * ключу. Всё остальное — одно значение.
 *
 * План «одним значением»: если список где-то не годится для адресации по id
 * (дубль, нет id), он сравнивается целиком — и в `base`, и в `next`. Для
 * слияния план считается по всем трём документам сразу (`atomicContainers`),
 * чтобы обе стороны описали одно и то же место одинаково.
 */
import { ORDER_SEGMENT, itemSegment, joinPath, keySegment } from "./address";
import { cloneJson, deepEqual, definedKeys, isPlainObject } from "./json";
import { DOCUMENT, childShape, fitsShape, idsOf, prefixOf } from "./shape";
import type { ListShape, MapShape, RecordShape, Shape } from "./shape";
import type { Doc, Op } from "./types";

type Plan = ReadonlySet<string>;

interface Ctx {
  out: Op[];
  plan: Plan;
}

// -- план «одним значением» ---------------------------------------------------

function collectRecord(
  shape: RecordShape,
  value: unknown,
  addr: string,
  out: Set<string>,
): void {
  if (!isPlainObject(value)) return;
  for (const key of definedKeys(value)) {
    const own = joinPath(addr, keySegment(key));
    const entries = shape.hoisted?.[key] ? addr : own;
    collectValue(childShape(shape, key), value[key], own, entries, out);
  }
}

function collectList(
  shape: ListShape,
  list: unknown[],
  entries: string,
  out: Set<string>,
): void {
  idsOf(shape, list).forEach((id, i) => {
    collectRecord(
      shape.item,
      list[i],
      joinPath(entries, itemSegment(shape.itemPrefix, id)),
      out,
    );
  });
}

function collectMap(
  shape: MapShape,
  map: Record<string, unknown>,
  entries: string,
  out: Set<string>,
): void {
  for (const key of definedKeys(map)) {
    const entry = joinPath(entries, itemSegment(shape.entryPrefix, key));
    collectValue(shape.entry, map[key], entry, entry, out);
  }
}

function collectValue(
  shape: Shape,
  value: unknown,
  own: string,
  entries: string,
  out: Set<string>,
): void {
  if (shape.kind === "record") return collectRecord(shape, value, own, out);
  if (value === undefined) return;
  if (!fitsShape(shape, value)) {
    out.add(own);
    return;
  }
  if (shape.kind === "list")
    return collectList(shape, value as unknown[], entries, out);
  collectMap(shape, value as Record<string, unknown>, entries, out);
}

/** Адреса контейнеров, которые в каком-то из документов не годятся для разбора. */
export function atomicContainers(docs: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  docs.forEach((doc) => collectRecord(DOCUMENT, doc, "", out));
  return out;
}

// -- сравнение ----------------------------------------------------------------

function unionKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] {
  return [...new Set([...definedKeys(a), ...definedKeys(b)])].sort();
}

function canDescend(
  shape: Shape,
  a: unknown,
  b: unknown,
  own: string,
  plan: Plan,
): boolean {
  if (shape.kind !== "record" && plan.has(own)) return false;
  return fitsShape(shape, a) && fitsShape(shape, b);
}

function diffRecord(
  shape: RecordShape,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  addr: string,
  ctx: Ctx,
): void {
  for (const key of unionKeys(a, b)) {
    const own = joinPath(addr, keySegment(key));
    const entries = shape.hoisted?.[key] ? addr : own;
    diffValue(childShape(shape, key), a[key], b[key], own, entries, ctx);
  }
}

function diffList(
  shape: ListShape,
  a: unknown[],
  b: unknown[],
  owner: string,
  ctx: Ctx,
): void {
  const idsA = idsOf(shape, a);
  const idsB = idsOf(shape, b);
  const indexA = new Map(idsA.map((id, i) => [id, i]));
  const indexB = new Map(idsB.map((id, i) => [id, i]));
  const itemPath = (id: string) =>
    joinPath(owner, itemSegment(shape.itemPrefix, id));

  idsA
    .filter((id) => !indexB.has(id))
    .forEach((id) => ctx.out.push({ op: "remove", path: itemPath(id) }));

  const keptA = idsA.filter((id) => indexB.has(id));
  const keptB = idsB.filter((id) => indexA.has(id));
  if (!deepEqual(keptA, keptB)) {
    ctx.out.push({
      op: "order",
      path: joinPath(owner, ORDER_SEGMENT),
      ids: keptB,
    });
  }

  idsB.forEach((id, i) => {
    if (indexA.has(id)) return;
    ctx.out.push({
      op: "add",
      path: itemPath(id),
      value: cloneJson(b[i]),
      after: idsB.slice(0, i).reverse(),
    });
  });

  keptB.forEach((id) => {
    const path = itemPath(id);
    diffValue(
      shape.item,
      a[indexA.get(id)!],
      b[indexB.get(id)!],
      path,
      path,
      ctx,
    );
  });
}

function diffMap(
  shape: MapShape,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  owner: string,
  ctx: Ctx,
): void {
  for (const key of unionKeys(a, b)) {
    const path = joinPath(owner, itemSegment(prefixOf(shape), key));
    diffValue(shape.entry, a[key], b[key], path, path, ctx);
  }
}

function descend(
  shape: Shape,
  a: unknown,
  b: unknown,
  own: string,
  entries: string,
  ctx: Ctx,
): void {
  if (shape.kind === "record")
    return diffRecord(shape, a as Doc, b as Doc, own, ctx);
  if (shape.kind === "list")
    return diffList(shape, a as unknown[], b as unknown[], entries, ctx);
  diffMap(shape, a as Doc, b as Doc, entries, ctx);
}

/**
 * `own` — адрес самого значения (им оно ставится/убирается целиком),
 * `entries` — под каким адресом лежат его элементы (у поднятых контейнеров —
 * адрес родителя).
 */
function diffValue(
  shape: Shape,
  a: unknown,
  b: unknown,
  own: string,
  entries: string,
  ctx: Ctx,
): void {
  if (deepEqual(a, b)) return;
  if (b === undefined) {
    ctx.out.push({ op: "remove", path: own });
    return;
  }
  if (a === undefined || !canDescend(shape, a, b, own, ctx.plan)) {
    ctx.out.push({ op: "set", path: own, value: cloneJson(b) });
    return;
  }
  descend(shape, a, b, own, entries, ctx);
}

export function diffWithPlan(base: Doc, next: Doc, plan: Plan): Op[] {
  const ctx: Ctx = { out: [], plan };
  diffRecord(DOCUMENT, base, next, "", ctx);
  return ctx.out;
}

export function diff(base: Doc, next: Doc): Op[] {
  return diffWithPlan(base, next, atomicContainers([base, next]));
}
