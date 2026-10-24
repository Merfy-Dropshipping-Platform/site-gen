import type { WrapperView } from '@merfy/storefront-build';
import { sectionSettingProblem, type SectionField } from './fields';
import type { SectionManifest } from './format';

// Общие настройки секции (блок 1 «Секций и SDK», часть 5, design.md 3.15, Р1-5-5…Р1-5-8): объявлены один раз здесь,
// секция перечисляет свои в section.json → "wrapper"; значения — ключ wrapper экземпляра в ревизии; классы и атрибуты
// на <merfy-section> считает wrapperView. Конструктор получает объявления в ответе /sections; имён секций здесь нет.
// format.ts импортирует этот файл, поэтому SectionManifest — только тип.
export const WRAPPER_IDS = ['scheme', 'padding', 'sticky'] as const;
export type WrapperId = (typeof WRAPPER_IDS)[number];
// Список по умолчанию: ключа wrapper в section.json нет.
export const DEFAULT_WRAPPER_IDS: readonly WrapperId[] = ['scheme', 'padding'];
export const STICKY_VALUES = ['none', 'scroll-up', 'always'] as const;
export type StickyValue = (typeof STICKY_VALUES)[number];

const SCHEME_FIELD: SectionField = {
  id: 'scheme',
  label: 'Цветовая схема',
  setting: { kind: 'color-scheme', default: '' },
};
const PADDING_FIELD: SectionField = {
  id: 'padding',
  label: 'Отступы',
  setting: { kind: 'padding', default: null, max: 120, step: 8 },
};
const STICKY_FIELD: SectionField = {
  id: 'sticky',
  label: 'Статичность',
  setting: {
    kind: 'select',
    default: 'none',
    options: [
      { value: 'none', label: 'Никогда' },
      { value: 'scroll-up', label: 'При прокрутке вверх' },
      { value: 'always', label: 'Всегда' },
    ],
  },
};

export const WRAPPER_FIELDS: readonly SectionField[] = [SCHEME_FIELD, PADDING_FIELD, STICKY_FIELD];

// Значения общих настроек экземпляра — только изменённые (ключ wrapper ревизии).
export interface WrapperValues {
  scheme?: string;
  padding?: { top: number; bottom: number };
  sticky?: StickyValue;
}

export const DEFAULT_WRAPPER_VIEW: WrapperView = { classes: ['py-section'], attributes: {} };

// Закрепление (Р1-5-7; часть 7б блока 7, Р7б-1). Классы стоят на самой <merfy-section>: закрепляется обёртка, а не элемент
// внутри неё. none ничего не добавляет; always закрепляет; scroll-up закрепляет и добавляет переход, сдвиг по data-hidden и
// поведение sticky-header (оно ставит и снимает data-hidden, режим читает из data-mode).
const PINNED = ['sticky', 'top-0', 'z-50'];

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

// Объявление общей настройки по id — для проверки значения правки.
const FIELD_OF: Readonly<Record<WrapperId, SectionField>> = {
  scheme: SCHEME_FIELD,
  padding: PADDING_FIELD,
  sticky: STICKY_FIELD,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Список общих настроек секции: нет ключа wrapper — список по умолчанию (design.md 3.15).
export const wrapperIdsOf = (manifest: Pick<SectionManifest, 'wrapper'>): readonly WrapperId[] =>
  manifest.wrapper ?? DEFAULT_WRAPPER_IDS;

// Значения правок по списку секции (Р1-5-6): значение проверяется объявлением из WRAPPER_FIELDS; padding: null — то же,
// что нет ключа. Чего нет в списке, неверное значение и неизвестный ключ — текстом в invalid, значения для них нет.
export function resolveWrapper(
  listed: readonly WrapperId[],
  edits: unknown,
): { values: WrapperValues; invalid: string[] } {
  if (edits !== null && edits !== undefined && !isRecord(edits)) {
    return { values: {}, invalid: ['wrapper: нужен объект с ключами scheme, padding, sticky'] };
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
    const text = sectionSettingProblem(known, FIELD_OF[known].setting, value);
    if (text === undefined) Object.assign(values, { [known]: value });
    else invalid.push(text);
  }
  return { values, invalid };
}

// Схема цвета — класс `color-<id>` (Р1-5-7): CSS даёт токены магазина. Отступ — шаг Tailwind 4 px: { top: 40 } →
// `pt-10`; нет правки и padding в списке — токен темы `py-section`; padding нет в списке — отступа нет совсем. Порядок
// классов: схема, отступы, закрепление; атрибуты — из таблицы закрепления.
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
  const sticky = values.sticky === undefined ? STICKY_VIEW.none : STICKY_VIEW[values.sticky];
  return { classes: [...classes, ...sticky.classes], attributes: { ...sticky.attributes } };
}

// Вид обёртки по умолчанию: py-section и без атрибутов — во входы сборки ключ wrapper не пишется (Р1-5-8).
export const isDefaultWrapperView = (view: WrapperView): boolean =>
  view.classes.length === 1 && view.classes[0] === 'py-section' && Object.keys(view.attributes).length === 0;

// Одна функция для сборки и превью: правки экземпляра → вид обёртки (и проблемы для журнала).
export function resolveWrapperView(
  manifest: Pick<SectionManifest, 'wrapper'>,
  edits: unknown,
): { view: WrapperView; invalid: string[] } {
  const resolved = resolveWrapper(wrapperIdsOf(manifest), edits);
  return { view: wrapperView(wrapperIdsOf(manifest), resolved.values), invalid: resolved.invalid };
}

// Проблемы ключа wrapper и ссылок в settings — текстом с путём (format.ts делает из них manifest-invalid). Повторы id в
// wrapper ловит схема формата; ссылку у блока — схема типов блока; wrapper у глобального скрипта — placeProblems.
export function wrapperProblems(manifest: SectionManifest): string[] {
  const listed = wrapperIdsOf(manifest);
  const seen = new Set<string>();
  const problems: string[] = [];
  manifest.settings.forEach((entry, index) => {
    if (!('wrapper' in entry)) return;
    const id = entry.wrapper;
    if (!listed.includes(id)) problems.push(`settings.${index}.wrapper: ${id} нет в списке wrapper секции`);
    if (seen.has(id)) problems.push(`settings.${index}.wrapper: ссылка на ${id} дважды`);
    seen.add(id);
  });
  return problems;
}
