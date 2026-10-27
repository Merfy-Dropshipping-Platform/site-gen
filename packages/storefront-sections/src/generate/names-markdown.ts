import { NAMES, OWN_NAME_LIMITS, sharedSettingHint, type NamesDictionary } from '../names';
import { GENERATED_NOTE } from './note';

// NAMES.md — словарь имён полей для людей и ИИ (блок 3 «Секций и SDK», Р3.13; блок 14 — документация с llms.txt).
// Тот же текст печатает pnpm merfy section names.

const INTRO =
  'Поле настройки секции — в `settings` файла `section.json` и у типов блоков — называется именем из этого списка, ' +
  'вид поля — из столбца «Виды». Имя не из списка проверка при сохранении не пропускает и выводит ближайшее; для имён ' +
  'из раздела «Нет в словаре» — что вместо них. Подходящего имени нет — секция объявляет своё (раздел «Своё имя секции»). ' +
  'Тот же текст выводит `pnpm merfy section names`.';

// Раздел про свои имена секции. Числа — OWN_NAME_LIMITS.
const OWN_NAMES_LINES: readonly string[] = [
  '## Своё имя секции',
  '',
  'Нужного имени в списке нет — секция объявляет своё в ключе `names` файла `section.json`, а поле берёт его в `id`. ' +
    `Свои имена — только этой секции и её блоков; словарь они не меняют.`,
  '',
  '```json',
  '{',
  '  "names": { "sku": { "kinds": ["toggle"], "label": "Артикул", "asks": ["артикул"] } },',
  '  "settings": [',
  '    { "id": "sku", "label": "Показывать артикул", "setting": { "kind": "toggle", "default": false } }',
  '  ]',
  '}',
  '```',
  '',
  '- `kinds` — виды полей, для которых имя годится; поле с этим именем другого вида проверка не пропустит (`setting-name-kind`).',
  '- `label` — подпись имени, до 32 знаков.',
  '- `asks` — слова, которыми мерчант просит об этом.',
  `- Имя — строчные латинские буквы и цифры через одиночный дефис, до ${OWN_NAME_LIMITS.length} знаков; не из раздела «Нет в словаре» ` +
    '(`name-own-invalid`) и не повтор имени словаря (`name-own-in-dictionary`).',
  `- Своих имён в секции — не больше ${OWN_NAME_LIMITS.names} (\`names-limit\`).`,
  '- Есть подходящее имя в словаре — бери его, а не своё.',
  '',
];

const kindsText =(kinds: readonly string[]): string => kinds.map((kind) => `\`${kind}\``).join(', ');

function tableLines(title: string, header: string, divider: string, rows: readonly string[]): readonly string[] {
  return ['## ' + title, '', header, divider, ...rows];
}

// Таблица группы: имена этой группы по порядку словаря.
function groupLines(group: string, rows: readonly string[]): readonly string[] {
  return tableLines(group, '| Имя | Виды | Подпись | О чём |', '|---|---|---|---|', rows);
}

// Таблицы групп — по порядку словаря, между блоками пустая строка.
function groupsOf(names: NamesDictionary): readonly string[] {
  return names.groups.flatMap((group) => {
    const rows = names.names
      .filter((entry) => entry.group === group.id)
      .map((entry) => `| \`${entry.name}\` | ${kindsText(entry.kinds)} | ${entry.label} | ${entry.about} |`);
    return [...groupLines(group.title, rows), ''];
  });
}

function refusalsOf(names: NamesDictionary): readonly string[] {
  return names.refusals.map((refusal) => `| ${refusal.names.map((name) => `\`${name}\``).join(', ')} | ${refusal.refusal} |`);
}

function sharedOf(names: NamesDictionary): readonly string[] {
  return names.shared.map((item) => `| \`${item.id}\` | Это ${sharedSettingHint(item)} |`);
}

export function namesMarkdown(names: NamesDictionary = NAMES): string {
  const lines: readonly string[] = [
    `<!-- ${GENERATED_NOTE} -->`,
    '# Имена полей секций',
    '',
    INTRO,
    '',
    ...groupsOf(names),
    ...OWN_NAMES_LINES,
    ...tableLines('Нет в словаре', '| Имена | Что вместо |', '|---|---|', [...refusalsOf(names), ...sharedOf(names)]),
  ];
  return lines.join('\n') + '\n';
}
