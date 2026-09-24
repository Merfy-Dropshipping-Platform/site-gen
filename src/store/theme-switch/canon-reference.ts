/**
 * Канон темы «глазами порта» — эталон для ответа «что потеряно» при смене
 * темы (этап 3, кусок 3.3, И4).
 *
 * Документ магазина команда читает через порт `StoreContent.load`
 * (миграции ревизий → досев контент-страниц → адреса ассетов витрины).
 * Чтобы сравнение «страница правлена мерчантом?» не ловило разницу от самих
 * преобразований, канон прежней темы проходит те же шаги, что меняют ТЕЛО
 * страницы. Нормализация метаданных страниц (`normalizeRevision`) и сведение
 * подвала к главной тела не касаются, а отпечаток тела хром страницы
 * (шапку/подвал) не учитывает — поэтому их здесь нет. Тот же набор шагов,
 * что у эталона фильтра записи B17 (`revision-write-filter.ts`).
 *
 * С провенансом этапа 2 (кто и что правил в ревизии) это сравнение станет
 * точным ответом и эталон будет не нужен.
 */
import { migrateRevisionData } from "../../utils/revision-migrations";
import { seedContentPagesFromTheme } from "../../themes/content-page-seed";
import { resolveAssetUrls } from "../../themes/asset-resolver";

export interface CanonReferenceSite {
  name: string | null;
  publicUrl: string | null;
}

export async function presentCanonLikePort(
  canon: Record<string, unknown>,
  themeId: string,
  site: CanonReferenceSite,
): Promise<Record<string, unknown>> {
  const migrated = migrateRevisionData(canon, themeId, site.name);
  const seeded = await seedContentPagesFromTheme(migrated, themeId);
  return resolveAssetUrls(seeded, site.publicUrl);
}
