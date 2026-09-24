/**
 * Нормализатор документа для записи с базой (этап 2): приводит базу, текущую
 * и входящую ревизии к одной версии формата и одному фильтру досеянного —
 * иначе 27 миграций на чтении и досеянные страницы выглядели бы для слияния
 * как правки (план этапа 2, «Риски и ловушки»).
 *
 * Как читать документ, решает адаптер: он передаёт сюда свои шаги чтения
 * (`load`). Эталон досеянного строится один раз — от текущей сохранённой
 * ревизии, ровно как у обычной записи (`filterSeededPagesOnWrite`).
 */
import {
  applySeedFilter,
  buildSeedReference,
} from "../utils/revision-write-filter";

type Doc = Record<string, unknown>;

export interface Normalizer {
  /** Шаги чтения + фильтр досеянного. */
  normalize(doc: Doc | undefined): Promise<Doc>;
  /** Фильтр досеянного для записи — тот же, что у записи без базы (если он включён). */
  filterForWrite(doc: Doc): Doc;
}

export interface NormalizerInput {
  /** Шаги чтения адаптера (миграции, досев, адреса). */
  load: (doc: Doc | undefined) => Promise<Doc>;
  /** Текущая сохранённая ревизия (сырая) — от неё строится эталон досеянного. */
  storedCurrent: Doc | undefined;
  themeId: string | null;
  publicUrl: string | null;
  /** Включён ли фильтр досеянного у самой записи (`SaveParams.filterSeeded`). */
  filterSeeded: boolean;
}

export async function makeDocumentNormalizer(
  input: NormalizerInput,
): Promise<Normalizer> {
  // Эталон не построился — фильтр не применяется (как у обычной записи:
  // потеря данных хуже лишней вмороженной страницы).
  const reference = await buildSeedReference(
    input.storedCurrent,
    input.themeId,
    input.publicUrl,
  ).catch(() => null);
  const filter = (doc: Doc): Doc =>
    reference ? applySeedFilter(doc, reference, input.storedCurrent).data : doc;
  return {
    normalize: async (doc) => filter(await input.load(doc)),
    filterForWrite: (doc) => (input.filterSeeded ? filter(doc) : doc),
  };
}
