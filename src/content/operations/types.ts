/**
 * Типы движка операций (этап 2, кусок 2.1). Все значения — обычный JSON:
 * операции можно хранить в `meta` ревизии, в черновике и отдавать в API.
 * Грамматика адресов — README.md рядом.
 */

export type Doc = Record<string, unknown>;

/** Поставить значение по адресу (поле, запись, страницу целиком). */
export interface SetOp {
  op: "set";
  path: string;
  value: unknown;
}

/** Убрать значение по адресу (поле, секцию, страницу). Убрать отсутствующее — ничего не делает. */
export interface RemoveOp {
  op: "remove";
  path: string;
}

/**
 * Вставить элемент списка (секцию, страницу в pages[]). `after` — id соседей
 * слева, ближний первым: вставка идёт после первого из них, который есть в
 * документе; если нет ни одного — в начало списка. Цепочка, а не один сосед,
 * — чтобы вставка пережила удаление соседа другим писателем.
 */
export interface AddOp {
  op: "add";
  path: string;
  value: unknown;
  after: string[];
}

/**
 * Порядок элементов списка. `ids` — порядок тех элементов, что были и до, и
 * после правки. Применяется «по слотам»: переставляются только названные
 * элементы, чужие новые элементы остаются на своих местах.
 */
export interface OrderOp {
  op: "order";
  path: string;
  ids: string[];
}

export type Op = SetOp | RemoveOp | AddOp | OrderOp;

/**
 * Политика для одного и того же места, изменённого обеими сторонами:
 *  - `last-writer-wins` — побеждает входящая правка, чужое значение уходит в
 *    `overwritten` (интерактивное сохранение конструктора, откат);
 *  - `reject-conflicts` — ничего не сливается, список мест уходит в `conflicts`
 *    (черновики и API-операции, ответ 409).
 */
export type MergePolicy = "last-writer-wins" | "reject-conflicts";

/** Значения одного места у двух сторон; `null` — значения нет. */
export interface ContestedValue {
  path: string;
  current: unknown;
  incoming: unknown;
}

export interface MergeResult {
  /** Слитый документ; `null`, если политика `reject-conflicts` и есть конфликты. */
  merged: Doc | null;
  /** Чужие значения, которые перезаписала входящая правка (`last-writer-wins`). */
  overwritten: ContestedValue[];
  /** Места, где правки сторон расходятся (`reject-conflicts`). */
  conflicts: ContestedValue[];
  /** Операции, которые превращают `current` в `merged`. */
  applied: Op[];
}
