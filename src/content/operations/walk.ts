/**
 * Разрешение адреса в место документа по форме (shape.ts).
 *
 * `locate` отдаёт цель последнего сегмента: поле объекта, элемент списка или
 * порядок списка. Промежуточные места обязаны существовать — иначе `null`
 * (движок не достраивает документ молча).
 *
 * `canonicalPath` возвращает поднятые ключи в адрес:
 * `page:home/block:Hero-1` → `pagesData/page:home/content/block:Hero-1`.
 * По каноническому адресу видно, что `page:home/content` (список целиком)
 * содержит `page:home/block:Hero-1`, а `pagesData` — `page:home`.
 */
import {
  ORDER_SEGMENT,
  covers,
  hasForbiddenSegment,
  parseSegment,
  splitPath,
} from "./address";
import type { ParsedSegment } from "./address";
import { isPlainObject } from "./json";
import { DOCUMENT, RECORD, childShape, idsOf, prefixOf } from "./shape";
import type {
  ContainerShape,
  ListShape,
  MapShape,
  RecordShape,
  Shape,
} from "./shape";

export type Target =
  | { kind: "field"; parent: Record<string, unknown>; key: string }
  | {
      kind: "item";
      list: unknown[];
      shape: ListShape;
      id: string;
      index: number;
    }
  | { kind: "order"; list: unknown[]; shape: ListShape };

interface Cursor {
  value: unknown;
  shape: Shape;
}

type Step = { target: Target; next: Cursor } | null;

function itemStep(list: unknown, shape: ListShape, id: string): Step {
  if (!Array.isArray(list)) return null;
  const index = list.findIndex((item) => shape.idOf(item) === id);
  const target: Target = { kind: "item", list, shape, id, index };
  return {
    target,
    next: { value: index < 0 ? undefined : list[index], shape: shape.item },
  };
}

function entryStep(map: unknown, shape: MapShape, key: string): Step {
  if (!isPlainObject(map)) return null;
  return {
    target: { kind: "field", parent: map, key },
    next: { value: map[key], shape: shape.entry },
  };
}

function orderStep(list: unknown, shape: ListShape): Step {
  if (!Array.isArray(list)) return null;
  return {
    target: { kind: "order", list, shape },
    next: { value: undefined, shape: RECORD },
  };
}

function containerStep(
  value: unknown,
  shape: ContainerShape,
  id: string,
): Step {
  return shape.kind === "list"
    ? itemStep(value, shape, id)
    : entryStep(value, shape, id);
}

/** Поднятый контейнер записи, отвечающий за префикс (`page:` → pagesData, `block:` → content). */
function hoistedByPrefix(
  shape: RecordShape,
  prefix: string,
): [string, ContainerShape] | undefined {
  return Object.entries(shape.hoisted ?? {}).find(
    ([, c]) => prefixOf(c) === prefix,
  );
}

/** Поднятый список записи — его порядок адресуется как `<запись>/order`. */
function hoistedList(shape: RecordShape): [string, ListShape] | undefined {
  const found = Object.entries(shape.hoisted ?? {}).find(
    ([, c]) => c.kind === "list",
  );
  return found as [string, ListShape] | undefined;
}

function recordStep(
  cursor: Cursor,
  shape: RecordShape,
  seg: ParsedSegment,
): Step {
  const record = cursor.value;
  if (!isPlainObject(record)) return null;
  if (seg.kind === "key") {
    return {
      target: { kind: "field", parent: record, key: seg.key },
      next: { value: record[seg.key], shape: childShape(shape, seg.key) },
    };
  }
  if (seg.kind === "order") {
    const list = hoistedList(shape);
    return list ? orderStep(record[list[0]], list[1]) : null;
  }
  const hoisted = hoistedByPrefix(shape, seg.prefix);
  return hoisted ? containerStep(record[hoisted[0]], hoisted[1], seg.id) : null;
}

/** Id элемента из сегмента: у пустого префикса — ключ, иначе — совпадающий префикс. */
function idFor(seg: ParsedSegment, prefix: string): string | undefined {
  if (seg.kind === "key" && prefix === "") return seg.key;
  if (seg.kind === "prefixed" && seg.prefix === prefix) return seg.id;
  return undefined;
}

function listStep(cursor: Cursor, shape: ListShape, seg: ParsedSegment): Step {
  if (seg.kind === "order") return orderStep(cursor.value, shape);
  const id = idFor(seg, shape.itemPrefix);
  return id === undefined ? null : itemStep(cursor.value, shape, id);
}

function mapStep(cursor: Cursor, shape: MapShape, seg: ParsedSegment): Step {
  const key = idFor(seg, shape.entryPrefix);
  return key === undefined ? null : entryStep(cursor.value, shape, key);
}

function step(cursor: Cursor, seg: ParsedSegment): Step {
  const { shape } = cursor;
  if (shape.kind === "record") return recordStep(cursor, shape, seg);
  if (shape.kind === "list") return listStep(cursor, shape, seg);
  return mapStep(cursor, shape, seg);
}

export function locate(doc: unknown, path: string): Target | null {
  if (hasForbiddenSegment(path)) return null;
  const segments = splitPath(path).map(parseSegment);
  let cursor: Cursor = { value: doc, shape: DOCUMENT };
  let target: Target | null = null;
  for (const seg of segments) {
    const next = step(cursor, seg);
    if (!next) return null;
    target = next.target;
    cursor = next.next;
  }
  return target;
}

/** Значение по адресу; места нет — `undefined`. У адреса порядка — id элементов. */
export function readAt(doc: unknown, path: string): unknown {
  const target = locate(doc, path);
  if (!target) return undefined;
  if (target.kind === "field") return target.parent[target.key];
  if (target.kind === "order") return idsOf(target.shape, target.list);
  return target.index < 0 ? undefined : target.list[target.index];
}

// -- канонический адрес ------------------------------------------------------

type CanonStep = { segments: string[]; next: Shape };

function canonRecord(
  shape: RecordShape,
  seg: ParsedSegment,
  raw: string,
): CanonStep {
  if (seg.kind === "key")
    return { segments: [raw], next: childShape(shape, seg.key) };
  if (seg.kind === "order") {
    const list = hoistedList(shape);
    return { segments: list ? [list[0], raw] : [raw], next: RECORD };
  }
  const hoisted = hoistedByPrefix(shape, seg.prefix);
  if (!hoisted) return { segments: [raw], next: RECORD };
  const [key, container] = hoisted;
  return {
    segments: [key, raw],
    next: container.kind === "list" ? container.item : container.entry,
  };
}

function canonStep(shape: Shape, seg: ParsedSegment, raw: string): CanonStep {
  if (shape.kind === "record") return canonRecord(shape, seg, raw);
  if (shape.kind === "map") return { segments: [raw], next: shape.entry };
  return { segments: [raw], next: seg.kind === "order" ? RECORD : shape.item };
}

export function canonicalPath(path: string): string {
  const out: string[] = [];
  let shape: Shape = DOCUMENT;
  for (const raw of splitPath(path)) {
    const next = canonStep(shape, parseSegment(raw), raw);
    out.push(...next.segments);
    shape = next.next;
  }
  return out.join("/");
}

/** `outer` содержит `inner` с учётом поднятых контейнеров. */
export function coversPath(outer: string, inner: string): boolean {
  return covers(canonicalPath(outer), canonicalPath(inner));
}

export function overlapsPath(a: string, b: string): boolean {
  return coversPath(a, b) || coversPath(b, a);
}

/** Адрес порядка списка, в котором лежит элемент. */
export function isOrderPath(path: string): boolean {
  const segments = splitPath(path);
  return segments.length > 0 && segments[segments.length - 1] === ORDER_SEGMENT;
}
