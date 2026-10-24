import type { DocsSources } from '../sources';

// theme-settings.md (блок 14): сквозные настройки «Настроек темы» из shared-settings.json и как их читать.
interface SharedSetting {
  readonly id: string;
  readonly label: string;
  readonly group: string;
}

const isSharedSetting = (value: unknown): value is SharedSetting => {
  if (typeof value !== 'object' || value === null) return false;
  return (
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'label') === 'string' &&
    typeof Reflect.get(value, 'group') === 'string'
  );
};

const parseShared = (shared: unknown): SharedSetting[] => {
  if (!Array.isArray(shared)) throw new Error('shared-settings.json: ожидался массив');
  const settings = shared.filter(isSharedSetting);
  if (settings.length !== shared.length) throw new Error('shared-settings.json: запись без id, label или group');
  return settings;
};

const groupsOf = (settings: readonly SharedSetting[]): string[] => [...new Set(settings.map((item) => item.group))];

export function themeSettingsPage(sources: DocsSources): string {
  const settings = parseShared(sources.shared);
  const groups = groupsOf(settings).map((group) => {
    const rows = settings
      .filter((item) => item.group === group)
      .map((item) => `| \`${item.id}\` | ${item.label} |`)
      .join('\n');
    return `## ${group}\n\n| id | Подпись |\n|---|---|\n${rows}`;
  });
  const example = settings[0];
  return [
    'Сквозные настройки общие у всех секций: их задаёт мерчант в «Настройках темы», секция читает значения. Список — из общих настроек платформы.',
    '',
    ...groups,
    '',
    '## Как читать',
    '',
    'Объяви `"uses": ["theme"]` в `section.json` и читай значение в шаблоне:',
    '',
    '```astro',
    '---',
    'const { settings, theme } = Astro.props;',
    '---',
    example === undefined ? '<p class="m-0">{theme[\'<id>\']}</p>' : `<p class="m-0">{theme['${example.id}']}</p>`,
    '```',
  ].join('\n');
}
