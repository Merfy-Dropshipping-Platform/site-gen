import type { experimental_AstroContainer } from 'astro/container';

// Рендер секции по модулю шаблона (блок 1 «Секций и SDK»): контейнер Astro, один на процесс, создаётся при первом
// рендере. Astro подключается динамически — он нужен только процессу рендера (render-worker.ts), не процессу сборщика.
// В Astro.props — settings, blocks (показанные блоки со значениями, часть 3) и __merfy: метка блока для превью (Р57)
// создаётся здесь, в процессе рендера, — функции через границу процесса не передаются. Пробный рендер при сохранении —
// trial.ts: он идёт в процессе рендера (блок 2, «Решил сам» п. 5).
export type SettingValues = Readonly<Record<string, string | boolean>>;
type AstroContainer = Awaited<ReturnType<typeof experimental_AstroContainer.create>>;
export type TemplateComponent = Parameters<AstroContainer['renderToString']>[0];

export interface TemplateBlock {
  id: string;
  type: string;
  settings: SettingValues;
}

export interface TemplateProps {
  settings: SettingValues;
  blocks: readonly TemplateBlock[];
  preview: boolean;
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
  const { settings, blocks, preview } = props;
  return (await containerOf()).renderToString(component, { props: { settings, blocks, __merfy: marksOf(preview) } });
}
