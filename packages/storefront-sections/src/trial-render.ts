import type { experimental_AstroContainer } from 'astro/container';

// Рендер секции по модулю шаблона и значениям настроек (блок 1 «Секций и SDK»): контейнер Astro, один на процесс,
// создаётся при первом рендере. Astro подключается динамически — он нужен только процессу рендера (render-worker.ts), не
// процессу сборщика. В Astro.props — только settings (Р3). Пробный рендер при сохранении — trial.ts: он идёт в процессе
// рендера (блок 2, «Решил сам» п. 5).
export type SettingValues = Readonly<Record<string, string | boolean>>;
type AstroContainer = Awaited<ReturnType<typeof experimental_AstroContainer.create>>;
export type TemplateComponent = Parameters<AstroContainer['renderToString']>[0];

let container: Promise<AstroContainer> | null = null;

function containerOf(): Promise<AstroContainer> {
  container ??= import('astro/container').then((astro) => astro.experimental_AstroContainer.create());
  return container;
}

export async function renderTemplate(component: TemplateComponent, settings: SettingValues): Promise<string> {
  return (await containerOf()).renderToString(component, { props: { settings } });
}
