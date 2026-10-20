import type { experimental_AstroContainer } from 'astro/container';
import { TEMPLATE_FILE } from './format';
import { loadTemplate } from './module-loader';
import { problem, type SectionProblem } from './problems';

// Рендер секции по модулю шаблона и значениям настроек (блок 1 «Секций и SDK»): контейнер Astro, один на процесс,
// создаётся при первом рендере. Astro подключается динамически — он нужен только процессам приёма и рендера, не
// процессу сборщика. В Astro.props — только settings (Р3).
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

// Пробный рендер при приёме: шаблон должен отрисоваться с умолчаниями настроек.
export async function trialRender(render: string, settings: SettingValues): Promise<SectionProblem[]> {
  try {
    await renderTemplate(await loadTemplate(render), settings);
    return [];
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return [problem('render-failed', TEMPLATE_FILE, `шаблон не отрисовался с умолчаниями настроек: ${text}`)];
  }
}
