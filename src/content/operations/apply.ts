/**
 * `apply(doc, ops) → doc`: применяет операции к копии документа, исходный не
 * трогает. Операция в пустоту (поле в секции, которой нет) — ошибка
 * `apply_target_missing`, а не молчаливая порча. Убрать отсутствующее —
 * ничего не делает: так одна и та же операция безопасна при повторе.
 */
import { cloneJson } from "./json";
import { idsOf } from "./shape";
import type { ListShape } from "./shape";
import type { AddOp, Doc, Op, OrderOp, RemoveOp, SetOp } from "./types";
import { locate } from "./walk";
import type { Target } from "./walk";

function missing(path: string): Error {
  return new Error(`apply_target_missing: ${path}`);
}

function invalid(op: Op): Error {
  return new Error(`apply_invalid_target: ${op.op} ${op.path}`);
}

function mustLocate(doc: Doc, path: string): Target {
  const target = locate(doc, path);
  if (!target) throw missing(path);
  return target;
}

/** Вставка после первого соседа из цепочки, который есть в списке; иначе — в начало. */
function insertAfter(
  list: unknown[],
  shape: ListShape,
  item: unknown,
  after: readonly string[],
): void {
  const ids = idsOf(shape, list);
  const anchor = after.find((id) => ids.includes(id));
  const at = anchor === undefined ? 0 : ids.indexOf(anchor) + 1;
  list.splice(at, 0, item);
}

/**
 * Порядок «по слотам»: названные элементы занимают те же места, что занимали,
 * но в названном порядке; чужие новые элементы остаются на своих местах.
 */
function reorderInSlots(
  list: unknown[],
  shape: ListShape,
  order: readonly string[],
): void {
  const ids = idsOf(shape, list);
  const wanted = order.filter((id) => ids.includes(id));
  const wantedSet = new Set(wanted);
  const slots = ids.flatMap((id, i) => (wantedSet.has(id) ? [i] : []));
  const byId = new Map(ids.map((id, i) => [id, list[i]]));
  slots.forEach((slot, k) => {
    list[slot] = byId.get(wanted[k]);
  });
}

function applySet(doc: Doc, op: SetOp): void {
  const target = mustLocate(doc, op.path);
  if (target.kind === "field") {
    target.parent[target.key] = cloneJson(op.value);
    return;
  }
  if (target.kind !== "item" || target.index < 0) throw invalid(op);
  target.list[target.index] = cloneJson(op.value);
}

function applyRemove(doc: Doc, op: RemoveOp): void {
  const target = locate(doc, op.path);
  if (!target) return;
  if (target.kind === "order") throw invalid(op);
  if (target.kind === "field") {
    delete target.parent[target.key];
    return;
  }
  if (target.index >= 0) target.list.splice(target.index, 1);
}

function applyAdd(doc: Doc, op: AddOp): void {
  const target = mustLocate(doc, op.path);
  if (target.kind !== "item") throw invalid(op);
  const value = cloneJson(op.value);
  if (target.index >= 0) {
    target.list[target.index] = value;
    return;
  }
  insertAfter(target.list, target.shape, value, op.after);
}

function applyOrder(doc: Doc, op: OrderOp): void {
  const target = mustLocate(doc, op.path);
  if (target.kind !== "order") throw invalid(op);
  reorderInSlots(target.list, target.shape, op.ids);
}

const APPLY: {
  [K in Op["op"]]: (doc: Doc, op: Extract<Op, { op: K }>) => void;
} = {
  set: applySet,
  remove: applyRemove,
  add: applyAdd,
  order: applyOrder,
};

function applyOne(doc: Doc, op: Op): void {
  (APPLY[op.op] as (d: Doc, o: Op) => void)(doc, op);
}

export function apply(doc: Doc, ops: readonly Op[]): Doc {
  const out = cloneJson(doc);
  ops.forEach((op) => applyOne(out, op));
  return out;
}

/** Адреса операций по порядку, без повторов. */
export function paths(ops: readonly Op[]): string[] {
  return [...new Set(ops.map((op) => op.path))];
}
