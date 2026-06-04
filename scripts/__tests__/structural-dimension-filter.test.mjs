// Тесты для фильтра E — структурные значения dimension-свойств + text-align,
// и для правила 3 — схлопывание дубликатов по брейкпоинтам.
//
// Контекст: rose Gallery предложил 41 токен, 5 из которых — ложно-токенизированные
// структурные значения (`width: full`, `height: full`, `text-align: left`)
// и избыточные дубликаты font-size: 16px на 4 брейкпоинтах. Скрипт должен их
// отфильтровать на уровне `catalog-block-aspects.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isStructuralDimension,
  DIMENSION_PROPERTIES,
  STRUCTURAL_DIMENSION_VALUES,
} from '../lib/utility-classify.mjs';

import { collapseDuplicateBreakpoints } from '../catalog-block-aspects.mjs';

// ───────────────────────────────────────────────────────────────
// 1. isStructuralDimension — правило 1 (dimension + ключевое слово)
// ───────────────────────────────────────────────────────────────

test('isStructuralDimension: width: full → true', () => {
  assert.equal(isStructuralDimension('width', 'full'), true);
});

test('isStructuralDimension: width: 1320px → false (число)', () => {
  assert.equal(isStructuralDimension('width', '1320px'), false);
});

test('isStructuralDimension: height: auto → true', () => {
  assert.equal(isStructuralDimension('height', 'auto'), true);
});

test('isStructuralDimension: height: full → true', () => {
  assert.equal(isStructuralDimension('height', 'full'), true);
});

test('isStructuralDimension: height: 100% → true', () => {
  assert.equal(isStructuralDimension('height', '100%'), true);
});

test('isStructuralDimension: min-height: 280px → false (число)', () => {
  assert.equal(isStructuralDimension('min-height', '280px'), false);
});

test('isStructuralDimension: max-width: none → true', () => {
  assert.equal(isStructuralDimension('max-width', 'none'), true);
});

test('isStructuralDimension: max-width: 1320px → false', () => {
  assert.equal(isStructuralDimension('max-width', '1320px'), false);
});

test('isStructuralDimension: min-width: 0 → true', () => {
  assert.equal(isStructuralDimension('min-width', '0'), true);
});

test('isStructuralDimension: max-height: screen → true', () => {
  assert.equal(isStructuralDimension('max-height', 'screen'), true);
});

// ───────────────────────────────────────────────────────────────
// 2. isStructuralDimension — правило 2 (text-align всегда структурно)
// ───────────────────────────────────────────────────────────────

test('isStructuralDimension: text-align: left → true', () => {
  assert.equal(isStructuralDimension('text-align', 'left'), true);
});

test('isStructuralDimension: text-align: right → true', () => {
  assert.equal(isStructuralDimension('text-align', 'right'), true);
});

test('isStructuralDimension: text-align: center → true', () => {
  assert.equal(isStructuralDimension('text-align', 'center'), true);
});

test('isStructuralDimension: text-align: justify → true', () => {
  assert.equal(isStructuralDimension('text-align', 'justify'), true);
});

test('isStructuralDimension: text-align: start → true', () => {
  assert.equal(isStructuralDimension('text-align', 'start'), true);
});

// ───────────────────────────────────────────────────────────────
// 3. isStructuralDimension — другие свойства НЕ фильтруются
// ───────────────────────────────────────────────────────────────

test('isStructuralDimension: padding: 16px → false', () => {
  assert.equal(isStructuralDimension('padding', '16px'), false);
});

test('isStructuralDimension: font-size: 14px → false', () => {
  assert.equal(isStructuralDimension('font-size', '14px'), false);
});

test('isStructuralDimension: color: #000 → false', () => {
  assert.equal(isStructuralDimension('color', '#000'), false);
});

test('isStructuralDimension: gap: 32px → false', () => {
  assert.equal(isStructuralDimension('gap', '32px'), false);
});

// ───────────────────────────────────────────────────────────────
// 4. isStructuralDimension — граничные случаи
// ───────────────────────────────────────────────────────────────

test('isStructuralDimension: пустые → false', () => {
  assert.equal(isStructuralDimension('', ''), false);
  assert.equal(isStructuralDimension(null, null), false);
  assert.equal(isStructuralDimension('width', null), false);
});

test('DIMENSION_PROPERTIES экспортируется и содержит ожидаемые', () => {
  assert.ok(DIMENSION_PROPERTIES.has('width'));
  assert.ok(DIMENSION_PROPERTIES.has('height'));
  assert.ok(DIMENSION_PROPERTIES.has('min-width'));
  assert.ok(DIMENSION_PROPERTIES.has('max-height'));
  assert.ok(!DIMENSION_PROPERTIES.has('padding'));
});

test('STRUCTURAL_DIMENSION_VALUES экспортируется и содержит ожидаемые', () => {
  assert.ok(STRUCTURAL_DIMENSION_VALUES.has('full'));
  assert.ok(STRUCTURAL_DIMENSION_VALUES.has('auto'));
  assert.ok(STRUCTURAL_DIMENSION_VALUES.has('100%'));
  assert.ok(STRUCTURAL_DIMENSION_VALUES.has('none'));
  assert.ok(!STRUCTURAL_DIMENSION_VALUES.has('16px'));
  assert.ok(!STRUCTURAL_DIMENSION_VALUES.has('1320px'));
});

// ───────────────────────────────────────────────────────────────
// 5. collapseDuplicateBreakpoints — правило 3
// ───────────────────────────────────────────────────────────────

test('collapse: 4 одинаковых font-size 16px по bp → 1 базовый + 3 в filtered', () => {
  const input = [
    {
      name: '--gallery-card-label-font-size',
      fallback: '14px',
      themeValue: '16px',
      element: 'cardLabel',
      property: 'font-size',
      state: null,
      breakpoint: null,
    },
    {
      name: '--gallery-card-label-font-size-md',
      fallback: '16px',
      themeValue: '16px',
      element: 'cardLabel',
      property: 'font-size',
      state: null,
      breakpoint: 'md',
    },
    {
      name: '--gallery-card-label-font-size-lg',
      fallback: '16px',
      themeValue: '16px',
      element: 'cardLabel',
      property: 'font-size',
      state: null,
      breakpoint: 'lg',
    },
    {
      name: '--gallery-card-label-font-size-xl',
      fallback: '16px',
      themeValue: '16px',
      element: 'cardLabel',
      property: 'font-size',
      state: null,
      breakpoint: 'xl',
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  assert.equal(kept.length, 1, 'оставить только базовый');
  assert.equal(kept[0].name, '--gallery-card-label-font-size');
  assert.equal(filtered.length, 3, '3 дубля в filtered');
  assert.ok(filtered.every((f) => /duplicate of/.test(f.reason)));
});

test('collapse: 4 разных значения по bp → все остаются', () => {
  const input = [
    {
      name: '--gallery-root-padding-x',
      themeValue: '16px',
      fallback: '16px',
      element: 'root',
      property: 'padding-x',
      state: null,
      breakpoint: null,
    },
    {
      name: '--gallery-root-padding-x-md',
      themeValue: '40px',
      fallback: '40px',
      element: 'root',
      property: 'padding-x',
      state: null,
      breakpoint: 'md',
    },
    {
      name: '--gallery-root-padding-x-lg',
      themeValue: '64px',
      fallback: '64px',
      element: 'root',
      property: 'padding-x',
      state: null,
      breakpoint: 'lg',
    },
    {
      name: '--gallery-root-padding-x-xl',
      themeValue: '80px',
      fallback: '80px',
      element: 'root',
      property: 'padding-x',
      state: null,
      breakpoint: 'xl',
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  assert.equal(kept.length, 4, 'все 4 разных bp остаются');
  assert.equal(filtered.length, 0, 'ни одного в filtered');
});

test('collapse: одиночный токен (без bp) → остаётся', () => {
  const input = [
    {
      name: '--gallery-card-media-border-radius',
      themeValue: '8px',
      fallback: 'var(--radius-media)',
      element: 'cardMedia',
      property: 'border-radius',
      state: null,
      breakpoint: null,
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  assert.equal(kept.length, 1);
  assert.equal(filtered.length, 0);
});

test('collapse: 2 одинаковых (base + md) → 1 базовый', () => {
  const input = [
    {
      name: '--gallery-x-font-size',
      themeValue: '16px',
      fallback: '14px',
      element: 'x',
      property: 'font-size',
      state: null,
      breakpoint: null,
    },
    {
      name: '--gallery-x-font-size-md',
      themeValue: '16px',
      fallback: '16px',
      element: 'x',
      property: 'font-size',
      state: null,
      breakpoint: 'md',
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].breakpoint, null);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, '--gallery-x-font-size-md');
});

test('collapse: одинаковые но без базового (только md/lg) → оставить все', () => {
  // Без базового мы не знаем, какое значение покрывает диапазон от 0,
  // поэтому осторожно оставляем все.
  const input = [
    {
      name: '--gallery-x-gap-md',
      themeValue: '24px',
      fallback: '24px',
      element: 'x',
      property: 'gap',
      state: null,
      breakpoint: 'md',
    },
    {
      name: '--gallery-x-gap-lg',
      themeValue: '24px',
      fallback: '24px',
      element: 'x',
      property: 'gap',
      state: null,
      breakpoint: 'lg',
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  assert.equal(kept.length, 2);
  assert.equal(filtered.length, 0);
});

test('collapse: смешанные группы — разные element не пересекаются', () => {
  const input = [
    {
      name: '--gallery-a-font-size',
      themeValue: '16px',
      fallback: '14px',
      element: 'a',
      property: 'font-size',
      state: null,
      breakpoint: null,
    },
    {
      name: '--gallery-a-font-size-md',
      themeValue: '16px',
      fallback: '16px',
      element: 'a',
      property: 'font-size',
      state: null,
      breakpoint: 'md',
    },
    {
      name: '--gallery-b-font-size',
      themeValue: '18px',
      fallback: '14px',
      element: 'b',
      property: 'font-size',
      state: null,
      breakpoint: null,
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  // a — схлопывается до 1, b — остаётся
  assert.equal(kept.length, 2);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, '--gallery-a-font-size-md');
});

test('collapse: разные state не схлопываются вместе с base', () => {
  // hover-состояние — отдельная группа, даже если значение совпадает
  const input = [
    {
      name: '--gallery-x-color',
      themeValue: '#000',
      fallback: '#000',
      element: 'x',
      property: 'color',
      state: null,
      breakpoint: null,
    },
    {
      name: '--gallery-x-color-hover',
      themeValue: '#000',
      fallback: '#000',
      element: 'x',
      property: 'color',
      state: 'hover',
      breakpoint: null,
    },
  ];
  const { kept, filtered } = collapseDuplicateBreakpoints(input);
  // Разные state — это разные группы, оба остаются
  assert.equal(kept.length, 2);
  assert.equal(filtered.length, 0);
});

test('collapse: пустой ввод → пустой вывод', () => {
  const { kept, filtered } = collapseDuplicateBreakpoints([]);
  assert.equal(kept.length, 0);
  assert.equal(filtered.length, 0);
});

// ───────────────────────────────────────────────────────────────
// 6. Интеграционный snapshot — реальные кейсы из rose Gallery
// ───────────────────────────────────────────────────────────────

test('integration: rose Gallery container width: full → отфильтровать', () => {
  // Это конкретный кейс из Gallery: container.width = full → НЕ токен.
  assert.equal(isStructuralDimension('width', 'full'), true);
});

test('integration: rose Gallery itemPrimary height-lg: full → отфильтровать', () => {
  assert.equal(isStructuralDimension('height', 'full'), true);
});

test('integration: rose Gallery itemSmall text-align: left → отфильтровать', () => {
  assert.equal(isStructuralDimension('text-align', 'left'), true);
});

test('integration: rose Gallery container max-width: 1320px → НЕ фильтровать (число)', () => {
  assert.equal(isStructuralDimension('max-width', '1320px'), false);
});

test('integration: rose Gallery itemPrimary min-height: 280px → НЕ фильтровать (число)', () => {
  assert.equal(isStructuralDimension('min-height', '280px'), false);
});
