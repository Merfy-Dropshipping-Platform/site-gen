import { TEMPLATE_FILE } from './format';
import { typoDistanceOf } from './name-check';
import { problem, type SectionProblem } from './problems';
import { RECORD_SHAPES, type FieldRead, type ShapeName } from './record-shapes';

// Текст отказа render-field-unknown (28.11): шаблон читает поле, которого у записи нет. Читает ответ слабая модель,
// поэтому в тексте всё для правки: что прочитано, у чего поля нет, какие поля есть (с пометкой, где форма не очевидна),
// ближайшее имя и совет вида — «сравнивай по amount, выводи text» у цены.

interface ShapeText {
  // «у цены»: чего поля нет.
  owner: string;
  // Пометки к полям в списке «Есть»: «копейки», «Money или null».
  notes?: Readonly<Record<string, string>>;
  tip?: string;
}

const MONEY = 'Money: amount, currency, text';
const MONEY_OR_NULL = `${MONEY} или null`;

const SHAPE_TEXT: Readonly<Record<ShapeName, ShapeText>> = {
  product: {
    owner: 'у товара',
    notes: { price: MONEY, compareAtPrice: MONEY_OR_NULL, images: 'адреса фото' },
    tip: 'Первое фото — `images[0]`, цену выводи `price.text`.',
  },
  collection: { owner: 'у коллекции', notes: { products: 'карточки товаров', productsCount: 'всего товаров' } },
  blog: { owner: 'у блога', notes: { articles: 'карточки статей' } },
  policy: { owner: 'у политики', notes: { html: 'текст HTML' } },
  money: {
    owner: 'у цены',
    notes: { amount: 'копейки', text: 'готовая строка' },
    tip: 'Сравнивай по `amount`, выводи `text`.',
  },
  option: { owner: 'у группы вариантов', notes: { values: 'значения' } },
  optionValue: { owner: 'у значения группы вариантов', notes: { swatch: 'цвет или null' } },
  variant: {
    owner: 'у варианта товара',
    notes: { price: MONEY, compareAtPrice: MONEY_OR_NULL, options: 'название группы → значение' },
  },
  link: { owner: 'у коллекции товара' },
  productCard: {
    owner: 'у карточки товара',
    notes: {
      price: MONEY,
      compareAtPrice: MONEY_OR_NULL,
      image: 'первое фото или null',
      variantId: 'вариант для «В корзину» или null',
    },
  },
  color: { owner: 'у образца цвета', notes: { swatch: '#rrggbb' } },
  articleCard: { owner: 'у карточки статьи', notes: { publishedText: 'дата словами' } },
  shop: { owner: 'у магазина' },
  shopContacts: { owner: 'у контактов магазина' },
  shopContactField: { owner: 'у строки контактов' },
  shopPolicy: { owner: 'у политики магазина' },
  shopPayments: { owner: 'у оплаты магазина' },
};

// Сколько отказов render-field-unknown на одно сохранение — как у утечек (trial.ts).
export const FIELD_PROBLEMS_MAX = 3;
const NEAR_MAX = 2;

const fieldText = (name: string, notes: Readonly<Record<string, string>>): string =>
  notes[name] === undefined ? `\`${name}\`` : `\`${name}\` (${notes[name]})`;

// Ближайшее поле вида с опечаткой до двух правок без учёта регистра: «image» → «images»; нет такого — пусто.
function nearestOf(key: string, fields: readonly string[]): string {
  const ranked = fields
    .map((name) => ({ name, distance: typoDistanceOf(key.toLowerCase(), name.toLowerCase()) }))
    .filter((item) => item.distance <= NEAR_MAX && item.distance < key.length)
    .sort((a, b) => a.distance - b.distance);
  return ranked[0] === undefined ? '' : ` Ближе всего — \`${ranked[0].name}\`.`;
}

export function fieldUnknownText(read: FieldRead): string {
  const text = SHAPE_TEXT[read.shape];
  const fields = Object.keys(RECORD_SHAPES[read.shape]);
  const listed = fields.map((name) => fieldText(name, text.notes ?? {})).join(', ');
  const tip = text.tip === undefined ? '' : ` ${text.tip}`;
  return `шаблон читает \`${read.path}.${read.key}\`: ${text.owner} нет поля \`${read.key}\`. Есть: ${listed}.${nearestOf(read.key, fields)}${tip}`;
}

// Чтения всех рендеров на примерах данных → отказы: одно место — один раз, не больше FIELD_PROBLEMS_MAX.
export function fieldUnknownProblems(reads: readonly FieldRead[]): SectionProblem[] {
  const unique = new Map(reads.map((read) => [`${read.path}|${read.key}`, read]));
  return [...unique.values()]
    .slice(0, FIELD_PROBLEMS_MAX)
    .map((read) => problem('render-field-unknown', TEMPLATE_FILE, fieldUnknownText(read)));
}
