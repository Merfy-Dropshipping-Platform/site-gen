// Переменные блоков оформления пяти тем из токенов nova (блок 10, Р10а-18). Цвета — тройкой «r g b» из #rrggbb схемы;
// не #rrggbb — переменной нет. Текстовые размеры — фиксированным px базовой ступени шкалы токена (min), как у тем
// прода: чекаут не тянет значения по экрану. Радиусы и ширина страницы — ссылкой на переменную nova.

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/;

// Тройка «r g b» из #rrggbb; не #rrggbb — null.
const rgbOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const hex = HEX.exec(value.toLowerCase());
  if (hex === null) return null;
  const [r, g, b] = [hex[1], hex[2], hex[3]].map((part) => Number.parseInt(part, 16));
  return `${r} ${g} ${b}`;
};

// .color-<схема> { --color-bg: 255 255 255; … } по каждой схеме; у схемы 2xl и 3xl к имени добавляется номер.
const schemeCss = (name: string, scheme: Readonly<Record<string, unknown>>): string => {
  const colors = Object.entries(CHECKOUT_COLOR_VARS).flatMap(([cssVar, token]) => {
    const rgb = rgbOf(scheme[token]);
    return rgb === null ? [] : [`  --${cssVar}: ${rgb};`];
  });
  return colors.length === 0 ? '' : `.color-${name} {\n${colors.join('\n')}\n}`;
};

// Фиксированный px текстовой ступени из корневых токенов: min шкалы (как у тем прода — размеры оформления не
// зависят от ширины экрана). Токен не найден или не шкала — ссылкой на переменную nova.
const scaleMinOf = (value: unknown): number | null => {
  if (typeof value !== 'object' || value === null || !('min' in value)) return null;
  const min: unknown = Reflect.get(value, 'min');
  return typeof min === 'number' ? min : null;
};

const sizeOf = (root: Readonly<Record<string, unknown>>, token: string): string => {
  const min = scaleMinOf(root[token]);
  return min === null ? `var(--${token})` : `${min}px`;
};

// :root { --size-body: 16px; … } — текстовые размеры фиксированным px ступени, радиусы и ширина — ссылкой.
const sizeCss = (root: Readonly<Record<string, unknown>>): string => {
  const sizes = Object.entries(CHECKOUT_SIZE_VARS).map(
    ([cssVar, token]) => `  --${cssVar}: ${FLUID_SIZE_VARS.has(cssVar) ? sizeOf(root, token) : `var(--${token})`};`,
  );
  return `:root {\n${sizes.join('\n')}\n}`;
};

// .color-<схема> { --color-bg: 255 255 255; … } по каждой схеме; :root { --size-body: 16px; … }.
export function checkoutVarsCss(
  schemes: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  root: Readonly<Record<string, unknown>> = {},
): string {
  const parts = [...Object.entries(schemes).map(([name, scheme]) => schemeCss(name, scheme)), sizeCss(root)].filter(
    (part) => part !== '',
  );
  return parts.join('\n');
}

export const CHECKOUT_COLOR_VARS: Readonly<Record<string, string>> = {
  'color-bg': 'background',
  'color-text': 'foreground',
  'color-muted': 'muted-foreground',
  'color-heading': 'foreground',
  'color-surface': 'card',
  'color-border': 'border',
  'color-error': 'destructive',
  'color-input-bg': 'background',
  'color-input-border': 'input',
  'color-input-label': 'muted-foreground',
  'color-input-placeholder': 'muted-foreground',
  'color-button-bg': 'primary',
  'color-button-text': 'primary-foreground',
  'color-button-border': 'primary-border',
};

export const CHECKOUT_SIZE_VARS: Readonly<Record<string, string>> = {
  'size-tiny': 'text-xs',
  'size-small': 'text-sm',
  'size-body': 'text-base',
  // Заголовки разделов у тем прода — 18px (flux --size-h3), итог — 24px: ступени text-lg и text-2xl.
  'size-h3': 'text-lg',
  'size-h2': 'text-2xl',
  'size-hero-heading': 'text-2xl',
  'radius-field': 'radius-input',
  'container-max-width': 'width-page',
};

// Текстовые ступени, которые у тем прода фиксированные: у nova шкала «min…max» — берём базу (min).
const FLUID_SIZE_VARS: ReadonlySet<string> = new Set([
  'size-tiny',
  'size-small',
  'size-body',
  'size-h3',
  'size-h2',
  'size-hero-heading',
]);
