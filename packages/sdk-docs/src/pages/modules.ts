import { ACTIONS } from '@merfy/shell/actions';
import { SECTION_USES } from '@merfy/storefront-sections';

// modules.md (блок 14): значения uses и действия каталога по модулям.
const USES_ABOUT: Readonly<Record<string, string>> = {
  theme: 'значения сквозных настроек темы в Astro.props.theme',
  shop: 'публичные данные магазина в Astro.props.shop',
};

const actionsOf = (module: string): string[] =>
  Object.entries(ACTIONS)
    .filter(([, spec]) => spec.module === module)
    .map(([name]) => `\`${name}\``);

export function modulesPage(): string {
  const uses = SECTION_USES.map((use) => `- \`"${use}"\` — ${USES_ABOUT[use] ?? ''}.`).join('\n');
  const modules = Object.keys(Object.fromEntries(Object.entries(ACTIONS).map(([, spec]) => [spec.module, true]))).map(
    (module) => {
      const actions = actionsOf(module);
      return `## ${module}\n\n${actions.length === 0 ? 'Действий разметки нет.' : `Действия: ${actions.join(', ')}.`}`;
    },
  );
  return [
    'Ключ `uses` в `section.json` открывает секции данные и модули SDK. Значения:',
    '',
    uses,
    '',
    '## Действия по модулям',
    '',
    ...modules,
  ].join('\n');
}
