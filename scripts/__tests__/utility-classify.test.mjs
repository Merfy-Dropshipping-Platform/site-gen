// Тесты классификации Tailwind утилит
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyUtility,
  splitPrefixes,
  arbitraryValue,
  isStructural,
  isGlobalToken,
  STRUCTURAL_VALUES,
} from '../lib/utility-classify.mjs';

// ───────── splitPrefixes ─────────
test('splitPrefixes: без префиксов', () => {
  const r = splitPrefixes('w-full');
  assert.equal(r.base, 'w-full');
  assert.equal(r.state, null);
  assert.equal(r.breakpoint, null);
});

test('splitPrefixes: один breakpoint', () => {
  const r = splitPrefixes('md:w-full');
  assert.equal(r.breakpoint, 'md');
  assert.equal(r.base, 'w-full');
});

test('splitPrefixes: state', () => {
  const r = splitPrefixes('hover:text-white');
  assert.equal(r.state, 'hover');
  assert.equal(r.base, 'text-white');
});

test('splitPrefixes: breakpoint + state', () => {
  const r = splitPrefixes('md:hover:text-white');
  assert.equal(r.breakpoint, 'md');
  assert.equal(r.state, 'hover');
  assert.equal(r.base, 'text-white');
});

test('splitPrefixes: 2xl breakpoint', () => {
  const r = splitPrefixes('2xl:max-w-[1920px]');
  assert.equal(r.breakpoint, '2xl');
  assert.equal(r.base, 'max-w-[1920px]');
});

// ───────── arbitraryValue ─────────
test('arbitraryValue: [10px]', () => {
  assert.equal(arbitraryValue('text-[10px]'), '10px');
});

test('arbitraryValue: [#fff]', () => {
  assert.equal(arbitraryValue('bg-[#fff]'), '#fff');
});

test('arbitraryValue: без скобок', () => {
  assert.equal(arbitraryValue('text-white'), null);
});

// ───────── classifyUtility: text-* ─────────
test('text-[10px] → font-size', () => {
  const c = classifyUtility('text-[10px]');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '10px');
});

test('text-xs → font-size 12px', () => {
  const c = classifyUtility('text-xs');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '12px');
});

test('text-sm → font-size 14px', () => {
  const c = classifyUtility('text-sm');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '14px');
});

test('text-base → font-size 16px (баг vanilla Footer)', () => {
  const c = classifyUtility('text-base');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '16px');
});

test('text-lg → font-size 18px', () => {
  const c = classifyUtility('text-lg');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '18px');
});

test('text-xl → font-size 20px', () => {
  const c = classifyUtility('text-xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '20px');
});

test('text-2xl → font-size 24px', () => {
  const c = classifyUtility('text-2xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '24px');
});

test('text-3xl → font-size 30px', () => {
  const c = classifyUtility('text-3xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '30px');
});

test('text-4xl → font-size 36px', () => {
  const c = classifyUtility('text-4xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '36px');
});

test('text-5xl → font-size 48px', () => {
  const c = classifyUtility('text-5xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '48px');
});

test('text-9xl → font-size 128px (граница карты)', () => {
  const c = classifyUtility('text-9xl');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '128px');
});

test('text-[16px] arbitrary → font-size 16px (без карты)', () => {
  const c = classifyUtility('text-[16px]');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '16px');
});

test('md:text-base → breakpoint=md, font-size=16px', () => {
  const c = classifyUtility('md:text-base');
  assert.equal(c.breakpoint, 'md');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '16px');
});

test('hover:text-xl → state=hover, font-size=20px', () => {
  const c = classifyUtility('hover:text-xl');
  assert.equal(c.state, 'hover');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '20px');
});

test('2xl:hover:text-4xl → breakpoint=2xl + state=hover + 36px', () => {
  const c = classifyUtility('2xl:hover:text-4xl');
  assert.equal(c.breakpoint, '2xl');
  assert.equal(c.state, 'hover');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, '36px');
});

test('text-[#fff] → color', () => {
  const c = classifyUtility('text-[#fff]');
  assert.equal(c.property, 'color');
  assert.equal(c.value, '#fff');
});

test('text-[rgb(var(--color-text))] → color', () => {
  const c = classifyUtility('text-[rgb(var(--color-text))]');
  assert.equal(c.property, 'color');
});

test('text-white → color', () => {
  const c = classifyUtility('text-white');
  assert.equal(c.property, 'color');
});

test('text-red-500 → color', () => {
  const c = classifyUtility('text-red-500');
  assert.equal(c.property, 'color');
});

test('text-center → text-align', () => {
  const c = classifyUtility('text-center');
  assert.equal(c.property, 'text-align');
  assert.equal(c.value, 'center');
});

test('text-left → text-align', () => {
  const c = classifyUtility('text-left');
  assert.equal(c.property, 'text-align');
});

test('text-[length:var(--size-nav-link)] → font-size', () => {
  const c = classifyUtility('text-[length:var(--size-nav-link)]');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, 'var(--size-nav-link)');
});

// ───────── bg-* ─────────
test('bg-[#fff] → background-color', () => {
  const c = classifyUtility('bg-[#fff]');
  assert.equal(c.property, 'background-color');
});

test('bg-[rgb(var(--color-bg))] → background-color', () => {
  const c = classifyUtility('bg-[rgb(var(--color-bg))]');
  assert.equal(c.property, 'background-color');
});

test('bg-white → background-color', () => {
  const c = classifyUtility('bg-white');
  assert.equal(c.property, 'background-color');
});

test('bg-gradient-to-r → background-image', () => {
  const c = classifyUtility('bg-gradient-to-r');
  assert.equal(c.property, 'background-image');
});

// ───────── border-* ─────────
test('border-[#fff] → border-color', () => {
  const c = classifyUtility('border-[#fff]');
  assert.equal(c.property, 'border-color');
});

test('border-2 → border-width', () => {
  const c = classifyUtility('border-2');
  assert.equal(c.property, 'border-width');
  assert.equal(c.value, '2px');
});

test('border-solid → border-style', () => {
  const c = classifyUtility('border-solid');
  assert.equal(c.property, 'border-style');
});

test('border-red-500 → border-color', () => {
  const c = classifyUtility('border-red-500');
  assert.equal(c.property, 'border-color');
});

// ───────── padding/margin ─────────
test('p-4 → padding', () => {
  const c = classifyUtility('p-4');
  assert.equal(c.property, 'padding');
  assert.equal(c.value, '16px');
});

test('px-[24px] → padding-x', () => {
  const c = classifyUtility('px-[24px]');
  assert.equal(c.property, 'padding-x');
  assert.equal(c.value, '24px');
});

test('mx-auto → margin-x', () => {
  const c = classifyUtility('mx-auto');
  assert.equal(c.property, 'margin-x');
  assert.equal(c.value, 'auto');
});

// ───────── width/height ─────────
test('w-full → width', () => {
  const c = classifyUtility('w-full');
  assert.equal(c.property, 'width');
  assert.equal(c.value, 'full');
});

test('max-w-[1920px] → max-width', () => {
  const c = classifyUtility('max-w-[1920px]');
  assert.equal(c.property, 'max-width');
  assert.equal(c.value, '1920px');
});

test('h-10 → height', () => {
  const c = classifyUtility('h-10');
  assert.equal(c.property, 'height');
});

// ───────── rounded ─────────
test('rounded-md → border-radius', () => {
  const c = classifyUtility('rounded-md');
  assert.equal(c.property, 'border-radius');
});

test('rounded-[8px] → border-radius', () => {
  const c = classifyUtility('rounded-[8px]');
  assert.equal(c.property, 'border-radius');
  assert.equal(c.value, '8px');
});

// ───────── font-weight ─────────
test('font-bold → font-weight', () => {
  const c = classifyUtility('font-bold');
  assert.equal(c.property, 'font-weight');
});

test('font-semibold → font-weight', () => {
  const c = classifyUtility('font-semibold');
  assert.equal(c.property, 'font-weight');
});

// ───────── font-family ─────────
test('[font-family:var(--font-body)] → font-family', () => {
  const c = classifyUtility('[font-family:var(--font-body)]');
  assert.equal(c.property, 'font-family');
});

// ───────── tracking / leading ─────────
test('tracking-wide → letter-spacing', () => {
  const c = classifyUtility('tracking-wide');
  assert.equal(c.property, 'letter-spacing');
});

test('leading-none → line-height', () => {
  const c = classifyUtility('leading-none');
  assert.equal(c.property, 'line-height');
});

// ───────── состояния ─────────
test('hover:text-white → state hover + color', () => {
  const c = classifyUtility('hover:text-white');
  assert.equal(c.property, 'color');
  assert.equal(c.state, 'hover');
});

test('focus:bg-[#000] → state focus', () => {
  const c = classifyUtility('focus:bg-[#000]');
  assert.equal(c.state, 'focus');
});

// ───────── isStructural ─────────
test('isStructural: auto', () => assert.equal(isStructural('auto'), true));
test('isStructural: flex', () => assert.equal(isStructural('flex'), true));
test('isStructural: 100%', () => assert.equal(isStructural('100%'), true));
test('isStructural: items-center', () => assert.equal(isStructural('items-center'), true));
test('isStructural: 16px (не структурное)', () => assert.equal(isStructural('16px'), false));
test('isStructural: #fff (не структурное)', () => assert.equal(isStructural('#fff'), false));

// ───────── isGlobalToken ─────────
test('isGlobalToken: rgb(var(--color-text))', () => assert.equal(isGlobalToken('rgb(var(--color-text))'), true));
test('isGlobalToken: var(--font-body)', () => assert.equal(isGlobalToken('var(--font-body)'), true));
test('isGlobalToken: var(--container-max-width)', () => assert.equal(isGlobalToken('var(--container-max-width)'), true));
test('isGlobalToken: 16px (не глобальный)', () => assert.equal(isGlobalToken('16px'), false));

// ───────── граничные случаи ─────────
test('classifyUtility: пустая строка → null', () => assert.equal(classifyUtility(''), null));
test('classifyUtility: неизвестная утилита → null', () => assert.equal(classifyUtility('foobar-zzz'), null));
test('classifyUtility: opacity-50', () => {
  const c = classifyUtility('opacity-50');
  assert.equal(c.property, 'opacity');
});

test('classifyUtility: 2xl:hover:text-[#fff]', () => {
  const c = classifyUtility('2xl:hover:text-[#fff]');
  assert.equal(c.breakpoint, '2xl');
  assert.equal(c.state, 'hover');
  assert.equal(c.property, 'color');
  assert.equal(c.value, '#fff');
});

test('classifyUtility: lg:max-w-[var(--header-nav-max-width-lg)]', () => {
  const c = classifyUtility('lg:max-w-[var(--header-nav-max-width-lg)]');
  assert.equal(c.breakpoint, 'lg');
  assert.equal(c.property, 'max-width');
});
