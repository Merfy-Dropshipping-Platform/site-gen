import type { ParamSpec, PresetName, PresetSpec } from './catalog';

// Пресеты data-animate (design.md блока 6, раздел 9). Данные вынесены из catalog.ts (12.11): их читают только появления
// и документация, а каталог поведений лежит в общем куске всех поведений — лишние байты ехали бы в каждое из них.
// Читать их по-прежнему можно из catalog.ts: он их отдаёт (export … from), но сам поведения не тянут.

const SCROLL = { trigger: 'view', margin: '0px 0px -15% 0px', amount: 0, opacity: 0, unit: 'px', delay: 0 } as const;
const RISE = { trigger: 'view', margin: '0px 0px -36px 0px', amount: 0.08, opacity: 0, x: 0, unit: 'px' } as const;
const LOAD = { target: 'self', trigger: 'load', margin: '0px', amount: 0, opacity: 0, x: 0, unit: 'px' } as const;

export const PRESETS: Readonly<Record<PresetName, PresetSpec>> = {
  appear: {
    ...SCROLL,
    target: 'self',
    x: 0,
    y: 24,
    duration: 600,
    easing: 'power2.out',
    stagger: 80,
    visibleAtStart: 'animate',
  },
  'appear-group': {
    ...SCROLL,
    target: 'children',
    x: 0,
    y: 24,
    duration: 500,
    easing: 'power2.out',
    stagger: 70,
    visibleAtStart: 'animate',
  },
  'appear-side': {
    ...SCROLL,
    target: 'section',
    x: 32,
    y: 24,
    duration: 700,
    easing: 'power3.out',
    stagger: 0,
    visibleAtStart: 'show',
  },
  'fade-up': {
    ...RISE,
    target: 'self',
    y: 20,
    duration: 650,
    easing: 'material',
    stagger: 0,
    delay: 0,
    visibleAtStart: 'animate',
  },
  'slide-down': {
    ...RISE,
    target: 'self',
    y: -16,
    duration: 550,
    easing: 'material',
    stagger: 0,
    delay: 0,
    visibleAtStart: 'animate',
  },
  'load-1': { ...LOAD, y: -16, duration: 700, easing: 'material', stagger: 0, delay: 50, visibleAtStart: 'animate' },
  'load-2': { ...LOAD, y: 20, duration: 700, easing: 'material', stagger: 0, delay: 150, visibleAtStart: 'animate' },
  'load-3': { ...LOAD, y: 20, duration: 700, easing: 'material', stagger: 0, delay: 280, visibleAtStart: 'animate' },
  letters: {
    ...SCROLL,
    target: 'letters',
    x: 0,
    y: 0.4,
    unit: 'em',
    duration: 500,
    easing: 'power2.out',
    stagger: 30,
    visibleAtStart: 'animate',
  },
  // 12.11, этап 2г спеки анимаций. Слова и строки поднимаются из-под маски (обёртка с overflow: hidden): сдвиг на всю
  // высоту куска, долгое торможение expo.out. Строки — по раскладке после загрузки шрифтов.
  words: {
    ...SCROLL,
    target: 'words',
    x: 0,
    y: 105,
    unit: '%',
    duration: 900,
    easing: 'expo.out',
    stagger: 60,
    visibleAtStart: 'animate',
  },
  lines: {
    ...SCROLL,
    target: 'lines',
    x: 0,
    y: 110,
    unit: '%',
    duration: 1100,
    easing: 'expo.out',
    stagger: 110,
    visibleAtStart: 'animate',
  },
  // Раскрытие маской clip-path снизу вверх: край маски идёт вверх, элемент поднимается на 40 px.
  'mask-up': {
    ...SCROLL,
    target: 'self',
    opacity: 1,
    x: 0,
    y: 40,
    duration: 1200,
    easing: 'expo.out',
    stagger: 120,
    visibleAtStart: 'animate',
    extra: { clipPath: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'] },
  },
  // Из размытия: blur 16 px → 0, прозрачность 0 → 1, подъём на 12 px.
  'blur-in': {
    ...SCROLL,
    target: 'self',
    x: 0,
    y: 12,
    duration: 1100,
    easing: 'power2.out',
    stagger: 90,
    visibleAtStart: 'animate',
    extra: { filter: ['blur(16px)', 'blur(0px)'] },
  },
  // Прорисовка линий SVG: у каждой линии SDK ставит pathLength="1", штрих 1 и сдвиг 1 → 0.
  draw: {
    ...SCROLL,
    target: 'shapes',
    opacity: 1,
    x: 0,
    y: 0,
    duration: 1600,
    easing: 'power2.inOut',
    stagger: 160,
    visibleAtStart: 'animate',
    extra: { strokeDasharray: [1, 1], strokeDashoffset: [1, 0] },
  },
};

// Параметры пресета на элементе с data-animate.
export const PRESET_PARAMS: Readonly<Record<string, ParamSpec>> = {
  delay: { kind: 'int', min: 0, max: 5000, default: 0 },
};
