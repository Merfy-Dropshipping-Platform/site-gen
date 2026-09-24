/**
 * Движок операций над документом магазина (этап 2, кусок 2.1): чистые
 * функции без доступа к БД. Грамматика адресов и правила — README.md.
 */
export { apply, paths } from "./apply";
export { diff } from "./diff";
export { merge3 } from "./merge3";
export type { MergeOptions } from "./merge3";
export { VOLATILE_PATHS } from "./shape";
export { readAt } from "./walk";
export type {
  AddOp,
  ContestedValue,
  Doc,
  MergePolicy,
  MergeResult,
  Op,
  OrderOp,
  RemoveOp,
  SetOp,
} from "./types";
