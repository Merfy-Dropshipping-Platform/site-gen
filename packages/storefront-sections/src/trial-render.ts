import type { SectionValue } from './fields';
import type { MenuTree, ShopProps } from '@merfy/storefront-build';
import type { experimental_AstroContainer } from 'astro/container';

// Рендер секции по модулю шаблона (блок 1 «Секций и SDK»): контейнер Astro, один на процесс, создаётся при первом
// рендере. Astro подключается динамически — он нужен только процессу рендера (render-worker.ts), не процессу сборщика.
// В Astro.props — settings, blocks (показанные блоки со значениями, часть 3) и __merfy: метка блока для превью (Р57)
// создаётся здесь, в процессе рендера, — функции через границу процесса не передаются. Пробный рендер при сохранении —
// trial.ts: он идёт в процессе рендера (блок 2, «Решил сам» п. 5).
// Значение настройки — любое значение JSON (часть 5 блока 1, Р1-5-2); тип объявлен в fields.ts, в 5а-2 переедет в
// storefront-build и здесь станет реэкспортом.
export type SettingValues = Readonly<Record<string, SectionValue>>;
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
}

let container: Promise<AstroContainer> | null = null;

function containerOf(): Promise<AstroContainer> {
  container ??= import('astro/container').then((astro) => astro.experimental_AstroContainer.create());
  return container;
}

// Метка блока (data-merfy-block): в превью — id блока, на витрине — undefined, и Astro атрибут не выводит.
const marksOf = (preview: boolean) => ({
  block: (block: unknown): string | undefined => {
    const id: unknown = preview ? Reflect.get(Object(block), 'id') : undefined;
    return typeof id === 'string' ? id : undefined;
  },
});

export async function renderTemplate(component: TemplateComponent, props: TemplateProps): Promise<string> {
  const { settings, blocks, preview, menus, theme, shop } = props;
  const values = { ...settings, ...menus };
  return (await containerOf()).renderToString(component, {
    props: { settings: values, blocks, theme, shop, __merfy: marksOf(preview) },
  });
}
