/**
 * «Отменить записи агента с ревизии R» (этап 6 спеки «Визи делает сайты в
 * конструкторе», Ч2) — чистая часть без базы.
 *
 * Документ — как если бы ревизий этого `source` после R не было, кроме мест,
 * которые после агента менял кто-то другой: они остаются и уходят в `kept`.
 *
 * Как: каждая запись агента отменяется своим «обратным» слиянием — от новой к
 * старой (как `git revert`). Для записи `до → после`:
 *   merge3(база = после, текущая = документ на этом шаге, входящая = до, keep-current)
 * Чужие правки после записи — «текущая сторона»: где они задели то же место,
 * остаётся их значение (место — в `conflicts`), остальное возвращается к «до».
 * Секция, добавленная агентом, убирается (обратная операция — `remove`),
 * удалённая — возвращается на место (`add` с соседями слева), порядок —
 * обратной операцией `order` по слотам; правленую другим секцию `keep-current`
 * не удаляет, удалённую другим — не возвращает.
 *
 * Место «оставлено» (`kept`) — спор, который не закрыла отмена более новой
 * записи агента: агент — мерчант — агент по одному полю даёт значение мерчанта,
 * но это обычная отмена, а не «оставлено» (её адрес уже поставила отмена
 * новой записи — `settled`).
 *
 * Страница новой темы — одна единица: если на ней остались секции, которые
 * правил другой, мета страницы (`pages/<id>`) не убирается. Пустые списки
 * секций страниц, которых не было в R, не остаются в документе.
 *
 * `scope.sections` — отменяются только операции внутри этих секций (поля,
 * добавление, удаление); порядок страницы целиком в `scope` не входит.
 * Обвязка с базой (цепочка ревизий, запись, повторы) — `undo-agent-write.ts`.
 */
import {
  itemSegment,
  joinPath,
  keySegment,
  parseSegment,
  splitPath,
} from "./operations/address";
import { isPlainObject } from "./operations/json";
import { coversPath, overlapsPath } from "./operations/locate";
import { withSectionLists } from "./operations/shape";
import { apply, diff, isVolatile, merge3, paths } from "./operations";
import type { Doc, MergeOptions, Op } from "./operations";
import type {
  UndoAuthor,
  UndoKeptPlace,
  UndoScope,
  UndoScopeSection,
  WriteSource,
} from "./store-content.port";

/** Ревизия после R: кто её записал и документ после неё (уже в одной версии формата). */
export interface UndoStep {
  author: UndoAuthor | null;
  document: Doc;
}

export interface UndoInput {
  /** Документ ревизии R. */
  since: Doc;
  /** Ревизии после R по времени; последняя — текущая. */
  steps: readonly UndoStep[];
  source: WriteSource;
  scope?: UndoScope;
  /** Операция — не правка (автозначение панели): не спорит и не применяется. */
  isAuto?: MergeOptions["isAuto"];
}

export interface UndoOutcome {
  document: Doc;
  undone: string[];
  kept: UndoKeptPlace[];
}

interface Progress {
  document: Doc;
  /** Адреса, которые уже поставила отмена более новых записей. */
  settled: string[];
  /** Спорные места, оставленные текущей стороне. */
  kept: string[];
}

const isAgentOf =
  (source: WriteSource) =>
  (author: UndoAuthor | null): boolean =>
    author?.actor === "agent" && author.source === source;

// -- scope -------------------------------------------------------------------

/** Адреса секции у двух форм документа: экземпляр новой темы и Puck-блок пяти тем. */
const SECTION_PATHS: Array<(section: UndoScopeSection) => string> = [
  ({ page, id }) =>
    joinPath(
      joinPath(keySegment("sections"), itemSegment("", page)),
      itemSegment("", id),
    ),
  ({ page, id }) =>
    joinPath(itemSegment("page:", page), itemSegment("block:", id)),
];

/** Фильтр операций по `scope`: нет секций — пропускает всё. */
function inScope(scope: UndoScope | undefined): (op: Op) => boolean {
  const sections = scope?.sections;
  if (!sections) return () => true;
  const roots = sections.flatMap((s) => SECTION_PATHS.map((at) => at(s)));
  return (op) => roots.some((root) => coversPath(root, op.path));
}

// -- страница новой темы — одна единица ---------------------------------------

/** Страница новой темы, внутри секций которой лежит адрес (`sections/<страница>/…`). */
function sectionPageOf(path: string): string | undefined {
  const [first, second] = splitPath(path).map(parseSegment);
  const isSections = first?.kind === "key" && first.key === "sections";
  return isSections && second?.kind === "key" ? second.key : undefined;
}

/** Обратные операции без удаления меты страниц, на которых остались чужие секции. */
function keepingPages(inverse: readonly Op[], held: readonly string[]): Op[] {
  const metas = held.map((page) => joinPath("pages", itemSegment("", page)));
  return inverse.filter(
    (op) => !(op.op === "remove" && metas.some((m) => coversPath(m, op.path))),
  );
}

// -- отмена одной записи -----------------------------------------------------

function revertOnce(
  after: Doc,
  current: Doc,
  inverse: readonly Op[],
  isAuto: MergeOptions["isAuto"],
) {
  return merge3(after, current, apply(after, inverse), "keep-current", {
    isAuto,
  });
}

/** Отмена записи `before → after` поверх документа шага; чужие места остаются. */
function revertStep(
  progress: Progress,
  before: Doc,
  after: Doc,
  input: UndoInput,
): Progress {
  const [from, to] = withSectionLists(after, before, before);
  const inverse = diff(from, to)
    .filter((op) => !isVolatile(op))
    .filter(inScope(input.scope));
  if (inverse.length === 0) return progress;
  const first = revertOnce(from, progress.document, inverse, input.isAuto);
  const held = [
    ...new Set(
      first.conflicts
        .map((c) => sectionPageOf(c.path))
        .filter((p): p is string => p !== undefined),
    ),
  ];
  const result =
    held.length === 0
      ? first
      : revertOnce(
          from,
          progress.document,
          keepingPages(inverse, held),
          input.isAuto,
        );
  const fresh = result.conflicts
    .map((c) => c.path)
    .filter((p) => !progress.settled.some((s) => coversPath(s, p)));
  return {
    document: result.merged ?? progress.document,
    settled: [...progress.settled, ...paths(result.applied)],
    kept: [...progress.kept, ...fresh],
  };
}

// -- уборка и отчёт ----------------------------------------------------------

/** Списки секций страниц, которых не было в R, — пустые после отмены — убираются. */
function withoutEmptySectionLists(doc: Doc, since: Doc): Doc {
  if (!isPlainObject(doc.sections)) return doc;
  const before = isPlainObject(since.sections) ? since.sections : {};
  const lists = doc.sections;
  const leftover = Object.keys(lists).filter(
    (page) =>
      Array.isArray(lists[page]) &&
      (lists[page] as unknown[]).length === 0 &&
      before[page] === undefined,
  );
  if (leftover.length === 0) return doc;
  const sections = Object.fromEntries(
    Object.entries(lists).filter(([page]) => !leftover.includes(page)),
  );
  return { ...doc, sections };
}

/** Наименьший набор: без повторов и без адресов внутри других. */
function outermost(list: readonly string[]): string[] {
  const unique = [...new Set(list)];
  return unique.filter(
    (p) => !unique.some((other) => other !== p && coversPath(other, p)),
  );
}

/** Последний не-агент, чья ревизия задела место; разницы шагов считаются один раз. */
function lastOtherAuthor(docs: readonly Doc[], input: UndoInput) {
  const isAgent = isAgentOf(input.source);
  const cache = new Map<number, Op[]>();
  const opsOf = (i: number): Op[] => {
    const known = cache.get(i);
    if (known) return known;
    const ops = diff(docs[i - 1], docs[i]);
    cache.set(i, ops);
    return ops;
  };
  const others = input.steps
    .map((step, i) => ({ author: step.author, at: i + 1 }))
    .filter((s) => !isAgent(s.author))
    .reverse();
  return (path: string): UndoAuthor | null =>
    others.find((s) => opsOf(s.at).some((op) => overlapsPath(op.path, path)))
      ?.author ?? null;
}

export function undoAgentDocs(input: UndoInput): UndoOutcome {
  const docs = [input.since, ...input.steps.map((s) => s.document)];
  const head = docs[docs.length - 1];
  const isAgent = isAgentOf(input.source);
  const agentSteps = input.steps
    .map((step, i) => ({ step, at: i + 1 }))
    .filter(({ step }) => isAgent(step.author))
    .reverse();
  const done = agentSteps.reduce<Progress>(
    (progress, { at }) => revertStep(progress, docs[at - 1], docs[at], input),
    { document: head, settled: [], kept: [] },
  );
  const document = withoutEmptySectionLists(done.document, input.since);
  const undone = paths(diff(head, document).filter((op) => !isVolatile(op)));
  const authorOf = lastOtherAuthor(docs, input);
  const kept = outermost(done.kept).map((path) => ({
    path,
    reason: "changed_after_agent" as const,
    by: authorOf(path),
  }));
  return { document, undone, kept };
}
