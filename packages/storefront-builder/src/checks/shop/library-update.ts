// Новая версия библиотечной секции у изменённой копии (место `shop`). Копию, которую изменил мерчант или агент,
// выпуск секции не трогает: улучшения библиотеки (быстрее грузится, один h1, eager-карточки) до неё не доходят. Проверка
// видит это по данным магазина — основа копии и версии библиотеки (`offerOf`, storefront-sections) — и просит агента
// спросить мерчанта. Место `shop`, а не `code`: на входе не только файлы секции, но и записи магазина о копии (основа,
// отказ мерчанта); отвечает за находку мерчант — `ask`, как у остальных проверок данных магазина. Одна находка на секцию.
import { readManifest, type SectionFiles, type UpdateOffer } from '@merfy/storefront-sections';
import { grouped, type CheckFinding, type FindingDraft } from '../finding';

export const LIBRARY_UPDATE_CHECK = 'library-update';
export const LIBRARY_UPDATE_RULE = 'newer-version';

// Что делать дальше — шаги инструмента merfy_sections в merfy-mcp (действия read upgrade, save с basedOn, decline).
const NEXT_STEPS =
  'Копию меняли, сама платформа её не обновит: спроси мерчанта, перенести ли его правки на новую версию (расскажи, что нового). ' +
  '«Да» — merfy_sections read с upgrade: true, перенеси правки, check, save с basedOn. «Нет» — merfy_sections decline.';

const titleOf = (files: SectionFiles, fallback: string): string => {
  const manifest = readManifest(files);
  return manifest.ok ? manifest.value.title : fallback;
};

export function libraryUpdateDraft(name: string, title: string, offer: UpdateOffer): FindingDraft {
  return {
    place: 'shop',
    check: LIBRARY_UPDATE_CHECK,
    rule: LIBRARY_UPDATE_RULE,
    level: 'warning',
    section: null,
    where: name,
    text: `«${title}» (${name}): есть новая версия секции — основа копии версия ${offer.base.version}, в библиотеке версия ${offer.latest.version} · ${NEXT_STEPS}`,
    fix: 'ask',
  };
}

// Находки копии по её файлам: предложения нет — пусто.
export function libraryUpdateFindings(
  name: string,
  files: SectionFiles,
  offer: UpdateOffer | undefined,
): CheckFinding[] {
  return offer === undefined ? [] : grouped([libraryUpdateDraft(name, titleOf(files, name), offer)]);
}
