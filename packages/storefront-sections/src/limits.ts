import type { FieldIssue, FieldList, RuleField, RuleSection } from './rule-types';

// Лимиты полей секции (блок 3 «Секций и SDK», раздел 3.4 design.md): панель секции остаётся обозримой — ошибки, не
// предупреждения. Числа — только из SETTINGS_LIMITS. Полей типа блока 16 (было 10): слайд «Слайд-шоу» на проде — 12
// полей (этап 0 базовых секций, E11). Типов блоков 8 (было 6): у «Товара» на проде восемь подпанелей — текст,
// название, цена, варианты, количество, кнопки, описание, «Поделиться» (базовые секции, 29.10).

export const SETTINGS_LIMITS = {
  sectionFields: 20,
  blockFields: 16,
  blockTypes: 8,
  blocksTotal: 50,
  optionsMin: 2,
  optionsMax: 10,
  labelMax: 32,
  sublabelMax: 120,
} as const;

const issue = (path: readonly (string | number)[], message: string): FieldIssue => ({
  code: 'settings-limit',
  path,
  message,
});

// Предел числа полей — по списку: у секции и у типа блока свой.
const FIELD_LIMIT: Readonly<Record<FieldList['of'], number>> = {
  section: SETTINGS_LIMITS.sectionFields,
  block: SETTINGS_LIMITS.blockFields,
};

const countProblem = (list: FieldList): FieldIssue[] =>
  list.fields.length <= FIELD_LIMIT[list.of]
    ? []
    : [issue(list.path, `полей у ${list.owner} — ${list.fields.length}, можно не больше ${FIELD_LIMIT[list.of]}`)];

// Подписи поля: ключ → где читать и предел знаков.
const FIELD_TEXTS: readonly { key: string; read: (field: RuleField) => string | undefined; limit: number }[] = [
  { key: 'label', read: (field) => field.label, limit: SETTINGS_LIMITS.labelMax },
  { key: 'section', read: (field) => field.section, limit: SETTINGS_LIMITS.labelMax },
  { key: 'row', read: (field) => field.row, limit: SETTINGS_LIMITS.labelMax },
  { key: 'sublabel', read: (field) => field.sublabel, limit: SETTINGS_LIMITS.sublabelMax },
];

const textProblems = (list: FieldList, field: RuleField, index: number): FieldIssue[] =>
  FIELD_TEXTS.flatMap(({ key, read, limit }) => {
    const text = read(field);
    if (text === undefined || text.length <= limit) return [];
    return [issue([...list.path, index, key], `поле \`${field.id}\`: \`${key}\` длиннее ${limit} знаков`)];
  });

const optionsProblems = (list: FieldList, field: RuleField, index: number): FieldIssue[] => {
  const options = field.setting.options;
  if (options === undefined) return [];
  const { optionsMin, optionsMax } = SETTINGS_LIMITS;
  if (options.length >= optionsMin && options.length <= optionsMax) return [];
  return [
    issue(
      [...list.path, index, 'setting', 'options'],
      `поле \`${field.id}\`: вариантов — ${options.length}, можно от ${optionsMin} до ${optionsMax}`,
    ),
  ];
};

const optionLabelProblems = (list: FieldList, field: RuleField, index: number): FieldIssue[] =>
  (field.setting.options ?? []).flatMap((option, optionIndex) =>
    option.label.length <= SETTINGS_LIMITS.labelMax
      ? []
      : [
          issue(
            [...list.path, index, 'setting', 'options', optionIndex, 'label'],
            `поле \`${field.id}\`: подпись варианта \`${option.value}\` длиннее ${SETTINGS_LIMITS.labelMax} знаков`,
          ),
        ],
  );

// Порядок: по спискам — число полей, потом по полям — варианты, подписи поля, подписи вариантов.
function listProblems(list: FieldList): FieldIssue[] {
  const fieldIssues = list.fields.flatMap((field, index) => [
    ...optionsProblems(list, field, index),
    ...textProblems(list, field, index),
    ...optionLabelProblems(list, field, index),
  ]);
  return [...countProblem(list), ...fieldIssues];
}

function blocksProblems(section: RuleSection): FieldIssue[] {
  const { blocks } = section;
  const problems: FieldIssue[] = [];
  if (blocks.length > SETTINGS_LIMITS.blockTypes) {
    problems.push(issue(['blocks'], `типов блоков — ${blocks.length}, можно не больше ${SETTINGS_LIMITS.blockTypes}`));
  }
  const total = blocks.reduce((sum, block) => sum + block.limit, 0);
  if (total > SETTINGS_LIMITS.blocksTotal) {
    problems.push(issue(['blocks'], `блоков по \`limit\` — ${total}, можно не больше ${SETTINGS_LIMITS.blocksTotal}`));
  }
  const longTitles = blocks
    .filter((block) => block.title.length > SETTINGS_LIMITS.labelMax)
    .map((block) => issue(['blocks', block.type, 'title'], `блок \`${block.type}\`: \`title\` длиннее ${SETTINGS_LIMITS.labelMax} знаков`));
  return [...problems, ...longTitles];
}

export function limitIssues(section: RuleSection): FieldIssue[] {
  return [...section.lists.flatMap(listProblems), ...blocksProblems(section)];
}
