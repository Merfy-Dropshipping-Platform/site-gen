// Места блоков расширений в шаблонах ролей (блок 12 «Секций и SDK», 12.8, В12-2 А): элемент с data-ext-point="<место>"
// в шаблоне секции — здесь ядро показывает блоки включённых расширений. Место → часть ядра, которая их показывает, и
// классы словаря, которые часть ставит своей разметке: CSS для них собирает сборка, как для toggleClass
// (script_meta.classes). Данные без кода и без побочных действий: их читают приём секции (storefront-sections,
// script-meta.ts, template-markup.ts) и части ядра (parts/points.ts, parts/records.ts, parts/purchase.ts).
export const EXT_POINT_ATTRIBUTE = 'data-ext-point';

export const EXT_POINTS = {
  cart: 'points',
  account: 'points',
  orders: 'records',
  product: 'purchase',
} as const;
export type ExtPoint = keyof typeof EXT_POINTS;
export type ExtPointPart = (typeof EXT_POINTS)[ExtPoint];
export const EXT_POINT_PARTS = ['points', 'purchase', 'records'] as const satisfies readonly ExtPointPart[];

export const isExtPoint = (value: string): value is ExtPoint => Object.hasOwn(EXT_POINTS, value);

// Классы разметки части points — из словаря (те же, что у секции cookie-banner фикстур). records и purchase оформлены
// стилями theme-base (.xo-*, --xp-*), классов словаря им не нужно.
export const EXT_POINT_CLASSES: Readonly<Record<ExtPointPart, readonly string[]>> = {
  points: [
    'flex',
    'flex-col',
    'gap-2',
    'gap-4',
    'm-0',
    'p-5',
    'border',
    'border-border',
    'rounded-card',
    'bg-background',
    'text-foreground',
    'text-sm',
    'text-base',
    'font-heading',
    'weight-heading',
    'text-heading',
    'underline',
    'inline-flex',
    'h-11',
    'w-full',
    'items-center',
    'justify-center',
    'rounded-button',
    'border-primary-border',
    'bg-primary',
    'px-6',
    'text-primary-foreground',
  ],
  records: [],
  purchase: [],
};
