import { sha256 } from '@merfy/storefront-build';
import { TEMPLATE_FILE } from './format';
import { problem, type SectionProblem } from './problems';
import { withSectionRenderer, type RendererOptions } from './render';
import type { SettingValues } from './trial-render';

// Пробный рендер при сохранении (блок 2 «Секций и SDK», «Решил сам» п. 5): модуль шаблона рендерит процесс рендера — с теми же
// правами и пределами, что на витрине. Процесс проверки чужой JS не исполняет: у него WASI, которого у процесса рендера
// нет. Шаблон должен рендериться с умолчаниями настроек.
export async function trialRender(
  render: string,
  settings: SettingValues,
  options: RendererOptions = {},
): Promise<SectionProblem[]> {
  const request = { section: 'trial', hash: sha256(Buffer.from(render, 'utf8')), module: render, settings };
  try {
    await withSectionRenderer((draw) => draw(request), options);
    return [];
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return [problem('render-failed', TEMPLATE_FILE, `шаблон не отрисовался с умолчаниями настроек: ${text}`)];
  }
}
