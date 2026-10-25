// Переменные блоков оформления пяти тем из токенов nova (блок 10, Р10а-18). Цвета — тройкой «r g b» из #rrggbb схемы;
// не #rrggbb — переменной нет. Размеры — ссылкой на переменную nova.

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

// :root { --size-body: var(--text-base); … } — размеры и радиусы ссылкой на переменную nova.
const sizeCss = (): string => {
  const sizes = Object.entries(CHECKOUT_SIZE_VARS).map(([cssVar, token]) => `  --${cssVar}: var(--${token});`);
  return `:root {\n${sizes.join('\n')}\n}`;
};

// .color-<схема> { --color-bg: 255 255 255; … } по каждой схеме; :root { --size-body: var(--text-base); … }.
export function checkoutVarsCss(schemes: Readonly<Record<string, Readonly<Record<string, unknown>>>>): string {
  const parts = [...Object.entries(schemes).map(([name, scheme]) => schemeCss(name, scheme)), sizeCss()].filter(
    (part) => part !== '',
  );
  return parts.join('\n');
}

export const CHECKOUT_COLOR_VARS: Readonly<Record<string, string>> = {
  'color-bg': 'background',
  'color-text': 'foreground',
  'color-muted': 'muted-foreground',
  'color-heading': 'heading',
  'color-surface': 'card',
  'color-border': 'border',
  'color-error': 'destructive',
  'color-input-bg': 'background',
  'color-input-border': 'input',
  'color-input-label': 'foreground',
  'color-input-placeholder': 'muted-foreground',
  'color-button-bg': 'primary',
  'color-button-text': 'primary-foreground',
  'color-button-border': 'primary-border',
};

export const CHECKOUT_SIZE_VARS: Readonly<Record<string, string>> = {
  'size-tiny': 'text-xs',
  'size-small': 'text-sm',
  'size-body': 'text-base',
  'size-h3': 'text-xl',
  'size-h2': 'text-2xl',
  'size-hero-heading': 'text-4xl',
  'radius-field': 'radius-input',
  'container-max-width': 'width-page',
};
