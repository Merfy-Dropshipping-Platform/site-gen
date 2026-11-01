import { settingFieldsOf } from './fields';
import { MANIFEST_FILE, TEMPLATE_FILE, type SectionManifest } from './format';
import { problem, type SectionProblem } from './problems';

// Список товаров страницы каталога и коллекции (шаг 5, 01.11; владелец: «косяк с каталогом там нет фильтров пагинация и
// так далее»): агент, переписывая «Каталог» или «Коллекцию», выкидывал фильтры, сортировку и листание — покупатель
// видел первые карточки и не мог ни отобрать, ни дойти до остальных. Такую секцию проверка не принимает: отказ называет,
// чего нет, и как это вернуть.
//
// Чья секция — список товаров страницы (любое из трёх):
//  - имя `catalog` или `collection`, либо оканчивается на `-catalog` или `-collection` (`exhibit-catalog`);
//  - у секции есть «Карточки» (`per-page`) и поле вида `collection` — так секцию находит сборка (page-list.ts, Р11а-6);
//  - шаблон читает фильтры или сортировки списка (`page.list.facets`, `page.list.sorts`).
// Блог (`per-page` без поля `collection`) и «Коллекция товаров» (`collection-products`: поле `cards`, без листания) — не
// списки страницы.
//
// Что должно быть: листание — поле `per-page`, корень с `data-behavior="catalog"`, строки в `data-part="list"` из
// `page.list.items` и переход дальше по `page.list.next` или `page.list.links`; фильтры — форма `data-part="filters"` со
// значениями `page.list.facets`; сортировка — `page.list.sorts`. Шаблон, где фильтр или сортировка показаны по типу
// блока (`'filters'`, `'sort'`), должен объявлять эти типы блоков в section.json — иначе мерчанту их не добавить.
// Читаем текст шаблона без комментариев: чтение через переменную (`const list = page.list`) тоже засчитывается.

const LIST_NAME = /(?:^|-)(?:catalog|collection)$/;
const COMMENTS = /<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g;
const LIST_READ = /\blist\??\.(items|facets|sorts|next|links)\b/g;
const BEHAVIOR = /data-behavior=["']catalog["']/;
const PART = (name: string): RegExp => new RegExp(`data-part=["']${name}["']`);
const BLOCK_TYPE = (type: string): RegExp => new RegExp(`type\\s*===?\\s*["']${type}["']`);

export const LIST_SECTION_DOC = 'data.md#список-страницы';

function readsOf(template: string): ReadonlySet<string> {
  return new Set([...template.matchAll(LIST_READ)].map((match) => match[1] ?? ''));
}

// Секция — список товаров страницы каталога или коллекции.
export function isListSection(manifest: SectionManifest, template: string): boolean {
  if (LIST_NAME.test(manifest.name)) return true;
  const fields = settingFieldsOf(manifest.settings);
  const paged = fields.some((field) => field.id === 'per-page');
  if (paged && fields.some((field) => field.setting.kind === 'collection')) return true;
  const reads = readsOf(template.replace(COMMENTS, ''));
  return reads.has('facets') || reads.has('sorts');
}

// Чего не хватает листанию: поле размера, поведение, строки, переход дальше.
function pagingMissing(manifest: SectionManifest, template: string, reads: ReadonlySet<string>): string[] {
  const fields = settingFieldsOf(manifest.settings);
  return [
    ...(fields.some((field) => field.id === 'per-page' && field.setting.kind === 'range')
      ? []
      : ['поле `per-page` вида `range` («Карточки», 2–24)']),
    ...(BEHAVIOR.test(template) ? [] : ['корень с `data-behavior="catalog"` и `data-paging={settings.paging}`']),
    ...(PART('list').test(template) && reads.has('items') ? [] : ['строки `data-part="list"` из `page.list.items`']),
    ...(reads.has('next') || reads.has('links')
      ? []
      : ['ссылка `data-part="next"` на `page.list.next` или номера `data-part="pages"` из `page.list.links`']),
  ];
}

// Чего не хватает списку: по строке на часть — листание, фильтры, сортировка, типы блоков.
function missingOf(manifest: SectionManifest, template: string): string[] {
  const reads = readsOf(template);
  const paging = pagingMissing(manifest, template, reads);
  const filters =
    PART('filters').test(template) && reads.has('facets')
      ? []
      : ['форма `<form data-part="filters" method="get" action={page.list.url}>` со значениями `page.list.facets`'];
  const sort = reads.has('sorts') ? [] : ['радио `name="sort"` из `page.list.sorts`'];
  const blocks = manifest.blocks ?? {};
  const types = ['filters', 'sort'].filter((type) => BLOCK_TYPE(type).test(template) && !(type in blocks));
  return [
    ...(paging.length > 0 ? [`листание: ${paging.join('; ')}`] : []),
    ...(filters.length > 0 ? [`фильтры: ${filters.join('')}`] : []),
    ...(sort.length > 0 ? [`сортировка: ${sort.join('')}`] : []),
    ...(types.length > 0
      ? [
          `типы блоков ${types.map((type) => `\`${type}\``).join(' и ')} в section.json: шаблон их ждёт, а мерчанту их не добавить`,
        ]
      : []),
  ];
}

// Отказ `list-incomplete`: секция — список товаров страницы, а фильтров, сортировки или листания в ней нет.
export function listSectionProblems(manifest: SectionManifest, template: string | undefined): SectionProblem[] {
  if (template === undefined) return [];
  const text = template.replace(COMMENTS, '');
  if (!isListSection(manifest, text)) return [];
  const missing = missingOf(manifest, text);
  if (missing.length === 0) return [];
  const file = missing.every((item) => item.startsWith('типы блоков')) ? MANIFEST_FILE : TEMPLATE_FILE;
  const message =
    `секция \`${manifest.name}\` — список товаров страницы каталога или коллекции, а в ней нет: ${missing.join(' | ')}. ` +
    'Покупатель без них видит только первые карточки. Верни эти части — образец разметки в библиотечных секциях ' +
    `\`catalog\` и \`collection\`, данные — ${LIST_SECTION_DOC}. Это витрина товаров не для каталога и коллекции — ` +
    'назови секцию без `catalog`/`collection` в конце и бери товары из поля `collection` (`settings.collection.products`)';
  return [problem('list-incomplete', file, message)];
}
