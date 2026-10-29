import type { MenuTree, PageInfo, SectionRecordValues, SettingValues, ShopProps } from '@merfy/storefront-build';
import type { experimental_AstroContainer } from 'astro/container';

// Рендер секции по модулю шаблона (блок 1 «Секций и SDK»): контейнер Astro, один на процесс, создаётся при первом
// рендере. Astro подключается динамически — он нужен только процессу рендера (render-worker.ts), не процессу сборщика.
// В Astro.props — settings, blocks (показанные блоки со значениями, часть 3) и __merfy: метка блока для превью (Р57)
// создаётся здесь, в процессе рендера, — функции через границу процесса не передаются. Пробный рендер при сохранении —
// trial.ts: он идёт в процессе рендера (блок 2, «Решил сам» п. 5).
// Значение настройки — любое значение JSON (часть 5 блока 1, Р1-5-2); тип объявлен в storefront-build и здесь
// реэкспортирован. Процесс рендера собирается в один файл, импорт — только типы, в бандл он не попадает.
export type { SectionValue, SettingValues } from '@merfy/storefront-build';
type AstroContainer = Awaited<ReturnType<typeof experimental_AstroContainer.create>>;
export type TemplateComponent = Parameters<AstroContainer['renderToString']>[0];

export interface TemplateBlock {
  id: string;
  type: string;
  settings: SettingValues;
}

// Часть 4: menus — деревья меню по id настройки вида menu: в шаблоне settings.<id> — дерево, а не id меню. theme и shop
// — настройки темы и данные магазина; модуль секции без "uses" их не читает (проверка шаблона, Р1-4-5).
export interface TemplateProps {
  settings: SettingValues;
  blocks: readonly TemplateBlock[];
  preview: boolean;
  menus: Readonly<Record<string, MenuTree>>;
  theme: SettingValues;
  shop: ShopProps;
  // Блок 7, часть 7а: страница секции — у каждой секции, без "uses".
  page: PageInfo;
  // Блок 8, часть 8г: записи полей с записями — в settings.<id> вместо id записи, как деревья меню.
  records: SectionRecordValues;
  // Записи полей с записями в блоках (29.10): id блока → id поля → запись; в block.settings.<id> вместо id записи.
  blockRecords?: Readonly<Record<string, SectionRecordValues>>;
}

let container: Promise<AstroContainer> | null = null;

function containerOf(): Promise<AstroContainer> {
  container ??= import('astro/container').then((astro) => astro.experimental_AstroContainer.create());
  return container;
}

// Правка текста в превью (часть 6): edit — путь к настройке («<id>» или «blocks/<id блока>/<id>»), hint — подпись пустого
// элемента; на витрине оба undefined, атрибуты не выводятся.
const marksOf = (preview: boolean) => ({
  block: (block: unknown): string | undefined => {
    const id: unknown = preview ? Reflect.get(Object(block), 'id') : undefined;
    return typeof id === 'string' ? id : undefined;
  },
  edit: (first: unknown, second?: unknown): string | undefined => {
    if (!preview) return undefined;
    if (typeof first === 'string') return first;
    const id: unknown = Reflect.get(Object(first), 'id');
    return typeof id === 'string' && typeof second === 'string' ? `blocks/${id}/${second}` : undefined;
  },
  hint: (label: unknown): string | undefined => (preview && typeof label === 'string' ? label : undefined),
});

export async function renderTemplate(component: TemplateComponent, props: TemplateProps): Promise<string> {
  const { settings, blocks, preview, menus, theme, shop, page, records, blockRecords = {} } = props;
  const values = { ...settings, ...menus, ...records };
  const withRecords = blocks.map((block) =>
    Object.hasOwn(blockRecords, block.id)
      ? { ...block, settings: { ...block.settings, ...blockRecords[block.id] } }
      : block,
  );
  return (await containerOf()).renderToString(component, {
    props: { settings: values, blocks: withRecords, theme, shop, page, __merfy: marksOf(preview) },
  });
}
