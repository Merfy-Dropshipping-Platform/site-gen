import { sha256 } from '@merfy/storefront-build';
import { TEMPLATE_FILE } from './format';
import { problem, type SectionProblem } from './problems';
import { withSectionRenderer, type RendererOptions } from './render';
import type { SettingValues, TemplateBlock } from './trial-render';

// Пробный рендер при сохранении (блок 2 «Секций и SDK», «Решил сам» п. 5): модуль шаблона рендерит процесс рендера — с теми же
// правами и пределами, что на витрине. Процесс проверки чужой JS не исполняет: у него WASI, которого у процесса рендера
// нет. Шаблон должен рендериться с умолчаниями настроек — и с пустыми строками вместо них (блок 3, Р3.11).

// Текст ошибки JavaScript, если рендер упал; прошла — undefined.
async function renderError(
  render: string,
  settings: SettingValues,
  options: RendererOptions,
  blocks: readonly TemplateBlock[],
): Promise<string | undefined> {
  const request = { section: 'trial', hash: sha256(Buffer.from(render, 'utf8')), module: render, settings, blocks };
  try {
    await withSectionRenderer((draw) => draw(request), options);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function trialRender(
  render: string,
  settings: SettingValues,
  options: RendererOptions = {},
  blocks: readonly TemplateBlock[] = [],
): Promise<SectionProblem[]> {
  const text = await renderError(render, settings, options, blocks);
  return text === undefined
    ? []
    : [problem('render-failed', TEMPLATE_FILE, `шаблон не отрисовался с умолчаниями настроек: ${text}`)];
}

// Второй пробный рендер — с пустыми значениями (блок 3 «Секций и SDK», Р3.11), блоков нет.
export async function emptyTrialRender(
  render: string,
  settings: SettingValues,
  options: RendererOptions = {},
): Promise<SectionProblem[]> {
  const text = await renderError(render, settings, options, []);
  return text === undefined
    ? []
    : [problem('render-empty-failed', TEMPLATE_FILE, `шаблон не отрисовался с пустыми значениями настроек: ${text}`)];
}
