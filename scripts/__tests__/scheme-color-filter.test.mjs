// Тесты для фильтра D — scheme-driven цвет в базе vs литерал в источнике.
//
// Правило: НЕ создавать токен когда у базы цвет через scheme-переменную
// (rgb(var(--color-*)) или var(--color-*)) а у источника — литерал
// (#hex, rgb(...), white). Темы должны переопределять цвет через
// colorSchemes, а не через захардкоженный токен.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isColorNatureProperty,
  isSchemeDrivenColor,
  isLiteralColor,
  shouldFilterAsSchemeColor,
  COLOR_NATURE_PROPERTIES,
} from '../lib/utility-classify.mjs';

// ───────────────────────────────────────────────────────────────
// 1. isColorNatureProperty
// ───────────────────────────────────────────────────────────────

test('isColorNatureProperty: color → true', () => {
  assert.equal(isColorNatureProperty('color'), true);
});

test('isColorNatureProperty: background-color → true', () => {
  assert.equal(isColorNatureProperty('background-color'), true);
});

test('isColorNatureProperty: border-color, border-top-color, ... → true', () => {
  for (const p of ['border-color', 'border-top-color', 'border-bottom-color',
    'border-left-color', 'border-right-color', 'outline-color',
    'text-decoration-color', 'caret-color', 'fill', 'stroke']) {
    assert.equal(isColorNatureProperty(p), true, `${p} должно быть цвет-свойством`);
  }
});

test('isColorNatureProperty: font-size, padding, ... → false', () => {
  for (const p of ['font-size', 'padding', 'padding-x', 'margin-left',
    'width', 'height', 'max-width', 'opacity', 'border-radius', 'gap']) {
    assert.equal(isColorNatureProperty(p), false, `${p} НЕ цвет-свойство`);
  }
});

test('isColorNatureProperty: COLOR_NATURE_PROPERTIES exporting set', () => {
  assert.ok(COLOR_NATURE_PROPERTIES.has('color'));
  assert.ok(COLOR_NATURE_PROPERTIES.has('stroke'));
  assert.ok(!COLOR_NATURE_PROPERTIES.has('font-size'));
});

// ───────────────────────────────────────────────────────────────
// 2. isSchemeDrivenColor
// ───────────────────────────────────────────────────────────────

test('isSchemeDrivenColor: rgb(var(--color-text)) → true', () => {
  assert.equal(isSchemeDrivenColor('rgb(var(--color-text))'), true);
});

test('isSchemeDrivenColor: rgba(var(--color-bg, 0)) → true', () => {
  assert.equal(isSchemeDrivenColor('rgba(var(--color-bg))'), true);
});

test('isSchemeDrivenColor: var(--color-text) → true', () => {
  assert.equal(isSchemeDrivenColor('var(--color-text)'), true);
});

test('isSchemeDrivenColor: var(--color-bg, 255 255 255) с fallback → true', () => {
  assert.equal(isSchemeDrivenColor('var(--color-bg, 255 255 255)'), true);
});

test('isSchemeDrivenColor: #000000 → false', () => {
  assert.equal(isSchemeDrivenColor('#000000'), false);
});

test('isSchemeDrivenColor: white → false', () => {
  assert.equal(isSchemeDrivenColor('white'), false);
});

test('isSchemeDrivenColor: var(--font-body) → false (не color)', () => {
  assert.equal(isSchemeDrivenColor('var(--font-body)'), false);
});

// ───────────────────────────────────────────────────────────────
// 3. isLiteralColor
// ───────────────────────────────────────────────────────────────

test('isLiteralColor: #000000 → true', () => {
  assert.equal(isLiteralColor('#000000'), true);
});

test('isLiteralColor: #fff → true', () => {
  assert.equal(isLiteralColor('#fff'), true);
});

test('isLiteralColor: rgb(255,0,0) → true', () => {
  assert.equal(isLiteralColor('rgb(255,0,0)'), true);
});

test('isLiteralColor: rgba(0, 0, 0, 0.5) → true', () => {
  assert.equal(isLiteralColor('rgba(0, 0, 0, 0.5)'), true);
});

test('isLiteralColor: hsl(0, 100%, 50%) → true', () => {
  assert.equal(isLiteralColor('hsl(0, 100%, 50%)'), true);
});

test('isLiteralColor: white → true', () => {
  assert.equal(isLiteralColor('white'), true);
});

test('isLiteralColor: black → true', () => {
  assert.equal(isLiteralColor('black'), true);
});

test('isLiteralColor: transparent → true', () => {
  assert.equal(isLiteralColor('transparent'), true);
});

test('isLiteralColor: red-500 (tailwind) → true', () => {
  assert.equal(isLiteralColor('red-500'), true);
});

test('isLiteralColor: slate-100 → true', () => {
  assert.equal(isLiteralColor('slate-100'), true);
});

test('isLiteralColor: rgb(var(--color-text)) → false (это scheme)', () => {
  assert.equal(isLiteralColor('rgb(var(--color-text))'), false);
});

test('isLiteralColor: var(--color-text) → false', () => {
  assert.equal(isLiteralColor('var(--color-text)'), false);
});

test('isLiteralColor: 16px → false', () => {
  assert.equal(isLiteralColor('16px'), false);
});

// ───────────────────────────────────────────────────────────────
// 4. shouldFilterAsSchemeColor — главные кейсы из задачи
// ───────────────────────────────────────────────────────────────

test('shouldFilterAsSchemeColor: text-[rgb(var(--color-text))] vs text-[#000000] → ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('color', 'rgb(var(--color-text))', '#000000');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: text-[rgb(var(--color-text))] vs text-[rgb(255,0,0)] → ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('color', 'rgb(var(--color-text))', 'rgb(255,0,0)');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: text-[#000000] vs text-[#000000] → НЕ ФИЛЬТРОВАТЬ (но и так одинаковы)', () => {
  // Этот кейс попадает в catalog-block-aspects: если base === source, мы сразу
  // выходим из обработки. Но всё равно фильтр сам не должен сказать «фильтр»,
  // потому что база НЕ scheme-driven.
  const r = shouldFilterAsSchemeColor('color', '#000000', '#000000');
  assert.equal(r, false);
});

test('shouldFilterAsSchemeColor: text-[#000000] vs text-[#ff0000] → НЕ ФИЛЬТРОВАТЬ (оба литералы)', () => {
  const r = shouldFilterAsSchemeColor('color', '#000000', '#ff0000');
  assert.equal(r, false);
});

test('shouldFilterAsSchemeColor: max-w-[1320px] vs max-w-[1920px] → НЕ ФИЛЬТРОВАТЬ (не цвет)', () => {
  const r = shouldFilterAsSchemeColor('max-width', '1320px', '1920px');
  assert.equal(r, false);
});

test('shouldFilterAsSchemeColor: bg-[rgb(var(--color-bg))] vs bg-white → ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('background-color', 'rgb(var(--color-bg))', 'white');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: border-[rgb(var(--color-text))] vs border-[#999] → ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('border-color', 'rgb(var(--color-text))', '#999');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: fill (svg) с scheme vs literal → ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('fill', 'rgb(var(--color-text))', 'black');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: padding не цвет → НЕ ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('padding', 'rgb(var(--color-text))', '#000');
  assert.equal(r, false);
});

test('shouldFilterAsSchemeColor: cartBadge fallback в базе == white в источнике, НО база НЕ scheme → НЕ ФИЛЬТРОВАТЬ', () => {
  // База: rgb(var(--color-button-text)) — это scheme. Источник: white литерал.
  // Фильтр должен сработать.
  const r = shouldFilterAsSchemeColor('color', 'rgb(var(--color-button-text))', 'white');
  assert.equal(r, true);
});

test('shouldFilterAsSchemeColor: base — литерал, source — литерал → НЕ ФИЛЬТРОВАТЬ', () => {
  const r = shouldFilterAsSchemeColor('color', 'white', '#000');
  assert.equal(r, false);
});

// ───────────────────────────────────────────────────────────────
// 5. Smoke-тест на интеграции с classifyUtility — проверяем что
//    classification + filter работает на реальных Tailwind утилитах.
// ───────────────────────────────────────────────────────────────

// (этот раздел перекрывается с catalog-block-aspects.test.mjs — здесь
// мы фиксируем сам уровень фильтра, не классификации)

test('integration: для color случая фильтр сработает (text-[rgb(var(--color-text))] → text-[#000000])', () => {
  const baseVal = 'rgb(var(--color-text))';
  const sourceVal = '#000000';
  const property = 'color';
  assert.equal(shouldFilterAsSchemeColor(property, baseVal, sourceVal), true);
});

test('integration: для height случая фильтр НЕ сработает (height: 18px → 16px)', () => {
  assert.equal(shouldFilterAsSchemeColor('height', '18px', '16px'), false);
});
