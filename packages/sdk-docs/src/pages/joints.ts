import { sampleRecord, RECORD_FIELDS } from '@merfy/storefront-build';
import { ACTIONS } from '@merfy/shell/actions';
import { actionNames, markupSplit } from './actions';

// joints.md: таблицы страницы «Стыки с витриной» строятся из тех же данных, что data.md, actions.md и styles.md: поля —
// из RECORD_FIELDS и записей-примеров сборки, действия — из ACTIONS, классы темы — из словаря токенов (сверяет тест).
const code = (names: readonly string[]): string => names.map((name) => `\`${name}\``).join(', ');
const keysOf = (value: object): string[] => Object.keys(value);

// Первый элемент записи-примера: примеры сборки заполнены, пустой список — поломка, а не «нет данных».
function first<T>(list: readonly T[], what: string): T {
  const item = list[0];
  if (item === undefined) throw new Error(`в записи-примере пусто: ${what}`);
  return item;
}

const product = sampleRecord('product');
const collection = sampleRecord('collection');
const blog = sampleRecord('blog');

interface RecordRow {
  readonly kind: string;
  readonly where: string;
  readonly fields: readonly string[];
}

// Что секция может взять: вид записи → где лежит → поля. Без полей вне списка: их нет в данных.
export const RECORD_ROWS: readonly RecordRow[] = [
  { kind: 'товар', where: 'поле `product`', fields: RECORD_FIELDS.product },
  { kind: 'вариант', where: '`product.variants[i]`', fields: keysOf(first(product.variants, 'variants')) },
  { kind: 'группа вариантов', where: '`product.options[i]`', fields: keysOf(first(product.options, 'options')) },
  {
    kind: 'значение группы',
    where: '`product.options[i].values[j]`',
    fields: keysOf(first(first(product.options, 'options').values, 'values')),
  },
  { kind: 'цена', where: '`price`, `compareAtPrice` везде', fields: keysOf(product.price) },
  { kind: 'коллекция', where: 'поле `collection`', fields: RECORD_FIELDS.collection },
  {
    kind: 'карточка товара',
    where: '`collection.products[i]`',
    fields: keysOf(first(collection.products, 'products')),
  },
  { kind: 'блог', where: 'поле `blog`', fields: RECORD_FIELDS.blog },
  { kind: 'карточка статьи', where: '`blog.articles[i]`', fields: keysOf(first(blog.articles, 'articles')) },
  { kind: 'статья', where: '`page.record` на странице статьи', fields: RECORD_FIELDS.article },
  { kind: 'страница-правило (политика)', where: 'поле `policy`', fields: RECORD_FIELDS.policy },
];

const recordsTable = (): string =>
  [
    '| Запись | Где | Поля |',
    '|---|---|---|',
    ...RECORD_ROWS.map((row) => `| ${row.kind} | ${row.where} | ${code(row.fields)} |`),
  ].join('\n');

// Первая часть описания действия: что делает; ответы, перечни значений и подробности — в actions.md.
const doesOf = (about: string): string => about.split(/[;:]/)[0] ?? about;

const withParams = actionNames().filter((name) => {
  const split = markupSplit(name);
  return split !== null && split.required.length + split.optional.length > 0;
});
const withoutParams = actionNames().filter((name) => markupSplit(name) !== null && !withParams.includes(name));

const dataAttrs = (params: readonly string[]): string =>
  params.length === 0 ? '—' : code(params.map((p) => `data-${p}`));

function actionsTable(): string {
  const rows = withParams.map((name) => {
    const split = markupSplit(name);
    return `| \`${name}\` | ${dataAttrs(split?.required ?? [])} | ${dataAttrs(split?.optional ?? [])} | ${doesOf(ACTIONS[name].about)} |`;
  });
  return [
    '| `data-action` | Обязательно | Можно | Что сделает витрина |',
    '|---|---|---|---|',
    ...rows,
    '',
    `Без параметров: ${code(withoutParams)}.`,
  ].join('\n');
}

// Роль → классы словаря токенов. Цвет, шрифт, радиус, тень — только токеном; тест сверяет каждый класс с TOKENS.md.
// Классы одной роли — группами: каждая группа в своём коде.
export const THEME_ROLES: readonly (readonly [string, readonly string[]])[] = [
  ['заголовок секции', ['m-0 font-heading weight-heading tracking-heading text-heading text-2xl md:text-3xl']],
  [
    'главная кнопка',
    [
      'inline-flex h-11 items-center justify-center rounded-button border-width-button border-primary-border bg-primary px-6 text-sm text-primary-foreground shadow-button hover:bg-primary-hover hover:text-primary-hover-foreground',
    ],
  ],
  ['цена, со скидкой, старая в `<s>`', ['text-price', 'text-sale', 'text-price-old']],
  ['плашка скидки', ['rounded-badge bg-sale px-2 py-1 text-xs text-sale-foreground']],
  ['фото; ширина секции', ['rounded-media', 'mx-auto max-w-page px-4']],
];

const themeTable = (): string =>
  ['| Что | Классы |', '|---|---|', ...THEME_ROLES.map(([role, groups]) => `| ${role} | ${code(groups)} |`)].join('\n');

const JOINTS_DATA: Readonly<Record<string, () => string>> = {
  'joints-records': recordsTable,
  'joints-actions': actionsTable,
  'joints-theme': themeTable,
};

// Метка `<!-- data: joints-records -->` в guide/joints.md.
export function jointsData(name: string): string | undefined {
  return JOINTS_DATA[name]?.();
}
