import type { WrapperView } from '@merfy/storefront-build';
import { z } from 'zod';
import {
  paddingMaxShape,
  paddingStepShape,
  paddingValueShape,
  sectionSettingProblem,
  type SectionField,
  type SectionSettingSpec,
} from './fields';
import type { SectionManifest } from './format';

// Общие настройки секции (блок 1 «Секций и SDK», часть 5, design.md 3.15, Р1-5-5…Р1-5-8): объявлены один раз здесь,
// секция перечисляет свои в section.json → "wrapper"; значения — ключ wrapper экземпляра в ревизии; классы и атрибуты
// на <merfy-section> считает wrapperView. Конструктор получает объявления в ответе /sections; имён секций здесь нет.
// Своё умолчание, предел и шаг секция задаёт ключом wrapperSpec (базовые секции, 29.10): объявление остаётся одно,
// секция меняет в нём только эти ключи. format.ts импортирует этот файл, поэтому SectionManifest — только тип.
export const WRAPPER_IDS = ['scheme', 'padding', 'sticky', 'width'] as const;
export type WrapperId = (typeof WRAPPER_IDS)[number];
// Список по умолчанию: ключа wrapper в section.json нет.
export const DEFAULT_WRAPPER_IDS: readonly WrapperId[] = ['scheme', 'padding'];
export const STICKY_VALUES = ['none', 'scroll-up', 'always'] as const;
export type StickyValue = (typeof STICKY_VALUES)[number];
// Блок 15, часть 15в (Р15в-2): умолчание объявления — «При прокрутке вверх», как на проде.
const STICKY_DEFAULT: StickyValue = 'scroll-up';
// Ширина содержимого секции (базовые секции, 29.10): «Маленькая», «Средняя», «Большая», как «Ширина» у
// «Изображения с текстом» на проде (ImageWithText.astro: max-w-3xl, max-w-5xl, max-w-7xl). «Большая» — ширина страницы
// темы (--width-page, у nova 1280 px, как max-w-7xl).
export const WIDTH_VALUES = ['small', 'medium', 'large'] as const;
export type WidthValue = (typeof WIDTH_VALUES)[number];
const WIDTH_DEFAULT: WidthValue = 'large';

const SCHEME_SETTING = { kind: 'color-scheme', default: '' } as const;
// Отступы до 160 на шаге 8 — как у секций пяти тем на проде (подвал: Footer.puckConfig.ts, constraints.padding), этап 0
// базовых секций (E15).
const PADDING_SETTING = { kind: 'padding', default: null, max: 160, step: 8 } as const;
const STICKY_SETTING = {
  kind: 'select',
  // Блок 15, часть 15в (Р15в-2): как конструктор и генератор пяти тем на проде — «При прокрутке вверх».
  default: STICKY_DEFAULT,
  options: [
    { value: 'none', label: 'Никогда' },
    { value: 'scroll-up', label: 'При прокрутке вверх' },
    { value: 'always', label: 'Всегда' },
  ],
} as const;
const WIDTH_SETTING = {
  kind: 'select',
  default: WIDTH_DEFAULT,
  options: [
    { value: 'small', label: 'Маленькая' },
    { value: 'medium', label: 'Средняя' },
    { value: 'large', label: 'Большая' },
  ],
} as const;

const LABELS: Readonly<Record<WrapperId, string>> = {
  scheme: 'Цветовая схема',
  padding: 'Отступы',
  sticky: 'Статичность',
  width: 'Ширина',
};

// Своё у секции (ключ wrapperSpec section.json): умолчание любой общей настройки, у «Отступов» — ещё предел и шаг.
// Значение умолчания и предел проверяет wrapperProblems по объявлению с этими ключами.
export const wrapperSpecShape = z.strictObject({
  scheme: z.strictObject({ default: z.string() }).optional(),
  padding: z
    .strictObject({
      default: z.union([z.null(), paddingValueShape]).optional(),
      max: paddingMaxShape.optional(),
      step: paddingStepShape.optional(),
    })
    .optional(),
  sticky: z.strictObject({ default: z.enum(STICKY_VALUES) }).optional(),
  width: z.strictObject({ default: z.enum(WIDTH_VALUES) }).optional(),
});
export type WrapperSpec = z.infer<typeof wrapperSpecShape>;

// Объявление общей настройки с ключами секции поверх. Без wrapperSpec — объявление платформы как есть.
function settingOf(id: WrapperId, own: WrapperSpec): SectionSettingSpec {
  switch (id) {
    case 'scheme':
      return { ...SCHEME_SETTING, ...own.scheme };
    case 'padding':
      return { ...PADDING_SETTING, ...own.padding };
    case 'sticky':
      return { ...STICKY_SETTING, options: [...STICKY_SETTING.options], ...own.sticky };
    case 'width':
      return { ...WIDTH_SETTING, options: [...WIDTH_SETTING.options], ...own.width };
  }
}

const fieldOf = (id: WrapperId, own: WrapperSpec = {}): SectionField => ({
  id,
  label: LABELS[id],
  setting: settingOf(id, own),
});

export const WRAPPER_FIELDS: readonly SectionField[] = WRAPPER_IDS.map((id) => fieldOf(id));

// Значения общих настроек экземпляра — только изменённые (ключ wrapper ревизии).
export interface WrapperValues {
  scheme?: string;
  padding?: { top: number; bottom: number };
  sticky?: StickyValue;
  width?: WidthValue;
}

export const DEFAULT_WRAPPER_VIEW: WrapperView = { classes: ['py-section'], attributes: {} };

// Закрепление (Р1-5-7; часть 7б блока 7, Р7б-1). Классы стоят на самой <merfy-section>: закрепляется обёртка, а не элемент
// внутри неё. none ничего не добавляет; always закрепляет; scroll-up закрепляет и добавляет переход, сдвиг по data-hidden и
// поведение sticky-header (оно ставит и снимает data-hidden, режим читает из data-mode). Без правки у секции со sticky
// в списке — scroll-up (Р15в-2). Закреплённая обёртка непрозрачна — фон своей схемы (bg-background): иначе при прокрутке
// под ней видно страницу, в том числе сквозь её отступы (базовые секции, 28.10).
const PINNED = ['sticky', 'top-0', 'z-50', 'bg-background'];

export const STICKY_VIEW: Readonly<Record<StickyValue, WrapperView>> = {
  none: { classes: [], attributes: {} },
  'scroll-up': {
    classes: [
      ...PINNED,
      'transition-transform',
      'duration-300',
      'motion-reduce:transition-none',
      'data-[hidden]:-translate-y-full',
    ],
    attributes: { 'data-behavior': 'sticky-header', 'data-mode': 'scroll-up' },
  },
  always: { classes: [...PINNED], attributes: {} },
};

// Ширина (базовые секции, 29.10): обёртка задаёт своей секции ширину страницы --width-page, содержимое в max-w-page
// становится уже, а фон схемы на обёртке остаётся во всю ширину. «Большая» — ширина страницы темы, класса нет.
const WIDTH_VIEW: Readonly<Record<WidthValue, readonly string[]>> = {
  small: ['[--width-page:768px]'],
  medium: ['[--width-page:1024px]'],
  large: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Список общих настроек секции: нет ключа wrapper — список по умолчанию (design.md 3.15).
export const wrapperIdsOf = (manifest: Pick<SectionManifest, 'wrapper'>): readonly WrapperId[] =>
  manifest.wrapper ?? DEFAULT_WRAPPER_IDS;

// Объявления общих настроек секции по её списку, с её wrapperSpec: их видит конструктор, по ним проверяются правки.
export const wrapperFieldsOf = (manifest: Pick<SectionManifest, 'wrapper' | 'wrapperSpec'>): SectionField[] =>
  wrapperIdsOf(manifest).map((id) => fieldOf(id, manifest.wrapperSpec));

// Умолчания секции из wrapperSpec — значения поверх объявлений платформы; padding: null — то же, что нет ключа.
function specDefaults(spec: WrapperSpec = {}): WrapperValues {
  const values: WrapperValues = {};
  if (spec.scheme !== undefined) values.scheme = spec.scheme.default;
  if (spec.padding?.default !== undefined && spec.padding.default !== null) values.padding = spec.padding.default;
  if (spec.sticky !== undefined) values.sticky = spec.sticky.default;
  if (spec.width !== undefined) values.width = spec.width.default;
  return values;
}

// Значения правок по списку секции (Р1-5-6): значение проверяется объявлением секции (WRAPPER_FIELDS с её wrapperSpec);
// padding: null — то же, что нет ключа. Чего нет в списке, неверное значение и неизвестный ключ — текстом в invalid,
// значения для них нет.
export function resolveWrapper(
  listed: readonly WrapperId[],
  edits: unknown,
  spec: WrapperSpec = {},
): { values: WrapperValues; invalid: string[] } {
  if (edits !== null && edits !== undefined && !isRecord(edits)) {
    return { values: {}, invalid: [`wrapper: нужен объект с ключами ${WRAPPER_IDS.join(', ')}`] };
  }
  const values: WrapperValues = {};
  const invalid: string[] = [];
  for (const [key, value] of Object.entries(edits ?? {})) {
    const known = WRAPPER_IDS.find((id) => id === key);
    if (known === undefined) {
      invalid.push(`${key}: такой общей настройки нет`);
      continue;
    }
    if (!listed.includes(known)) {
      invalid.push(`${key}: общей настройки нет в списке wrapper секции`);
      continue;
    }
    if (known === 'padding' && value === null) continue;
    const text = sectionSettingProblem(known, settingOf(known, spec), value);
    if (text === undefined) Object.assign(values, { [known]: value });
    else invalid.push(text);
  }
  return { values, invalid };
}

// Схема цвета — класс `color-<id>` (Р1-5-7): CSS даёт токены магазина. Отступ — шаг Tailwind 4 px: { top: 40 } →
// `pt-10`; нет правки и padding в списке — токен темы `py-section`; padding нет в списке — отступа нет совсем. Ширина —
// WIDTH_VIEW. Порядок классов: схема, отступы, ширина, закрепление; атрибуты — из таблицы закрепления.
const SCHEME_CLASS_PREFIX = 'color-';
const PADDING_UNIT = 4;

export function wrapperView(listed: readonly WrapperId[], values: WrapperValues): WrapperView {
  const classes: string[] = [];
  if (listed.includes('scheme') && values.scheme !== undefined && values.scheme !== '')
    classes.push(`${SCHEME_CLASS_PREFIX}${values.scheme}`);
  if (listed.includes('padding'))
    classes.push(
      ...(values.padding === undefined
        ? ['py-section']
        : [`pt-${values.padding.top / PADDING_UNIT}`, `pb-${values.padding.bottom / PADDING_UNIT}`]),
    );
  if (listed.includes('width')) classes.push(...WIDTH_VIEW[values.width ?? WIDTH_DEFAULT]);
  // Нет правки: sticky в списке секции — умолчание объявления (scroll-up), нет в списке — без закрепления.
  const sticky = STICKY_VIEW[values.sticky ?? (listed.includes('sticky') ? STICKY_DEFAULT : 'none')];
  return { classes: [...classes, ...sticky.classes], attributes: { ...sticky.attributes } };
}

// Вид обёртки по умолчанию: py-section и без атрибутов — во входы сборки ключ wrapper не пишется (Р1-5-8).
export const isDefaultWrapperView = (view: WrapperView): boolean =>
  view.classes.length === 1 && view.classes[0] === 'py-section' && Object.keys(view.attributes).length === 0;

// Одна функция для сборки и превью: правки экземпляра поверх умолчаний секции (wrapperSpec) → вид обёртки (и проблемы
// для журнала). У секции без wrapperSpec — как раньше: умолчания платформы.
export function resolveWrapperView(
  manifest: Pick<SectionManifest, 'wrapper' | 'wrapperSpec'>,
  edits: unknown,
): { view: WrapperView; invalid: string[] } {
  const listed = wrapperIdsOf(manifest);
  const resolved = resolveWrapper(listed, edits, manifest.wrapperSpec);
  const values = { ...specDefaults(manifest.wrapperSpec), ...resolved.values };
  return { view: wrapperView(listed, values), invalid: resolved.invalid };
}

// wrapperSpec: только общие настройки из списка секции; умолчание — значение по объявлению с ключами секции (у
// «Отступов» — в пределе секции).
function specProblems(manifest: SectionManifest): string[] {
  const listed = wrapperIdsOf(manifest);
  const spec = manifest.wrapperSpec ?? {};
  return WRAPPER_IDS.flatMap((id) => {
    const own = spec[id];
    if (own === undefined) return [];
    if (!listed.includes(id)) return [`wrapperSpec.${id}: ${id} нет в списке wrapper секции`];
    const value = own.default;
    if (value === undefined) return [];
    const text = sectionSettingProblem(`wrapperSpec.${id}.default`, settingOf(id, spec), value);
    return text === undefined ? [] : [text];
  });
}

// Проблемы ключей wrapper, wrapperSpec и ссылок в settings — текстом с путём (format.ts делает из них manifest-invalid).
// Повторы id в wrapper ловит схема формата; ссылку у блока — схема типов блока; wrapper у глобального скрипта —
// placeProblems.
export function wrapperProblems(manifest: SectionManifest): string[] {
  const listed = wrapperIdsOf(manifest);
  const seen = new Set<string>();
  const problems: string[] = [...specProblems(manifest)];
  manifest.settings.forEach((entry, index) => {
    if (!('wrapper' in entry)) return;
    const id = entry.wrapper;
    if (!listed.includes(id)) problems.push(`settings.${index}.wrapper: ${id} нет в списке wrapper секции`);
    if (seen.has(id)) problems.push(`settings.${index}.wrapper: ссылка на ${id} дважды`);
    seen.add(id);
  });
  return problems;
}
