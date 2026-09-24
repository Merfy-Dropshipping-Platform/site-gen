/**
 * Модель записи документа (этап 2): всё, что алгоритму записи с базой нужно
 * знать о модели документа, — и ничего о SQL.
 *
 *  - `normalize` — база, текущая и входящая приводятся к одной версии формата
 *    (шаги чтения адаптера: миграции, досев, адреса) и одному фильтру
 *    досеянного (эталон — от текущей сохранённой ревизии, как у обычной
 *    записи); иначе 27 миграций на чтении и досеянные страницы выглядели бы
 *    для слияния как правки.
 *  - `filterForWrite` — фильтр досеянного самой записи (если он включён).
 *  - `isAutoValue` — автозначение панели конструктора: не спорит при слиянии,
 *    не применяется поверх чужого, не попадает в `meta.changes`.
 *  - `isDerived` — копия служебного блока на внутренней странице: в `meta`
 *    считается отдельно от правок мерчанта.
 *
 * Как читать документ и какие дефолты у панели, решает адаптер — он
 * передаёт сюда свои шаги чтения и значения по умолчанию панели темы.
 */
import {
  applySeedFilter,
  buildSeedReference,
} from "../utils/revision-write-filter";
import { isChromeCopy, makeAutoValueRule } from "./change-kinds";
import type { PanelDefaults } from "./change-kinds";
import type { Doc, Op } from "./operations";

export interface WriteModel {
  /** Шаги чтения + фильтр досеянного. */
  normalize(doc: Doc | undefined): Promise<Doc>;
  /** Фильтр досеянного для записи — тот же, что у записи без базы (если он включён). */
  filterForWrite(doc: Doc): Doc;
  /** Операция `diff(base, side)` — автозначение панели, а не правка. */
  isAutoValue(op: Op, base: Doc, side: Doc): boolean;
  /** Операция — копия служебного блока на внутренней странице. */
  isDerived(op: Op, ...docs: Doc[]): boolean;
}

export interface WriteModelInput {
  /** Шаги чтения адаптера (миграции, досев, адреса). */
  load: (doc: Doc | undefined) => Promise<Doc>;
  /** Текущая сохранённая ревизия (сырая) — от неё строится эталон досеянного. */
  storedCurrent: Doc | undefined;
  themeId: string | null;
  publicUrl: string | null;
  /** Включён ли фильтр досеянного у самой записи (`SaveParams.filterSeeded`). */
  filterSeeded: boolean;
  /** Значения по умолчанию панели темы (тип секции → defaultProps). */
  panelDefaults: PanelDefaults;
  /** Куда писать предупреждения (лог адаптера). */
  warn: (message: string) => void;
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function makeDocumentWriteModel(
  input: WriteModelInput,
): Promise<WriteModel> {
  // Эталон не построился — фильтр не применяется (как у обычной записи:
  // потеря данных хуже лишней вмороженной страницы), но не молча.
  const reference = await buildSeedReference(
    input.storedCurrent,
    input.themeId,
    input.publicUrl,
  ).catch((e: unknown) => {
    input.warn(
      `эталон досеянного не построился (тема ${input.themeId ?? "—"}): ${reasonOf(e)} — фильтр досеянного для этой записи выключен`,
    );
    return null;
  });
  const filter = (doc: Doc): Doc =>
    reference ? applySeedFilter(doc, reference, input.storedCurrent).data : doc;
  return {
    normalize: async (doc) => filter(await input.load(doc)),
    filterForWrite: (doc) => (input.filterSeeded ? filter(doc) : doc),
    isAutoValue: makeAutoValueRule(input.panelDefaults),
    isDerived: isChromeCopy,
  };
}
