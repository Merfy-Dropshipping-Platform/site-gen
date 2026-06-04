// Тесты классификации transform-утилит Tailwind: scale / rotate / translate /
// skew / arbitrary [transform:...].
//
// Корень задачи: на rose Footer (rose-Footer.astro:69) у кнопки submit стоит
// `active:scale-95`. До этого фикса `classifyUtility('scale-95')` возвращала
// null → токен `--footer-newsletter-submit-transform-active` не создавался →
// приёмка проваливалась на проверке 3 «псевдо-состояния».

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyUtility } from '../lib/utility-classify.mjs';

// ───────── scale ─────────

test('classifyUtility: scale-95 → transform scale(0.95)', () => {
  const c = classifyUtility('scale-95');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scale(0.95)');
  assert.equal(c.state, null);
  assert.equal(c.breakpoint, null);
});

test('classifyUtility: scale-100 → scale(1)', () => {
  const c = classifyUtility('scale-100');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scale(1)');
});

test('classifyUtility: scale-50 → scale(0.5)', () => {
  const c = classifyUtility('scale-50');
  assert.equal(c.value, 'scale(0.5)');
});

test('classifyUtility: scale-105 → scale(1.05)', () => {
  const c = classifyUtility('scale-105');
  assert.equal(c.value, 'scale(1.05)');
});

test('classifyUtility: scale-110 → scale(1.1)', () => {
  const c = classifyUtility('scale-110');
  assert.equal(c.value, 'scale(1.1)');
});

test('classifyUtility: scale-x-95 → scaleX(0.95)', () => {
  const c = classifyUtility('scale-x-95');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scaleX(0.95)');
});

test('classifyUtility: scale-y-110 → scaleY(1.1)', () => {
  const c = classifyUtility('scale-y-110');
  assert.equal(c.value, 'scaleY(1.1)');
});

// ───────── scale + псевдо-состояния (корневая задача) ─────────

test('classifyUtility: active:scale-95 → state=active', () => {
  const c = classifyUtility('active:scale-95');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scale(0.95)');
  assert.equal(c.state, 'active');
  assert.equal(c.breakpoint, null);
});

test('classifyUtility: hover:scale-105 → state=hover, scale(1.05)', () => {
  const c = classifyUtility('hover:scale-105');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scale(1.05)');
  assert.equal(c.state, 'hover');
});

test('classifyUtility: focus:scale-90 → state=focus', () => {
  const c = classifyUtility('focus:scale-90');
  assert.equal(c.state, 'focus');
  assert.equal(c.value, 'scale(0.9)');
});

// ───────── scale + breakpoints + state ─────────

test('classifyUtility: md:scale-110 → breakpoint=md', () => {
  const c = classifyUtility('md:scale-110');
  assert.equal(c.property, 'transform');
  assert.equal(c.breakpoint, 'md');
  assert.equal(c.state, null);
  assert.equal(c.value, 'scale(1.1)');
});

test('classifyUtility: md:hover:scale-95 → md+hover', () => {
  const c = classifyUtility('md:hover:scale-95');
  assert.equal(c.breakpoint, 'md');
  assert.equal(c.state, 'hover');
  assert.equal(c.value, 'scale(0.95)');
});

test('classifyUtility: 2xl:active:scale-95 → 2xl+active', () => {
  const c = classifyUtility('2xl:active:scale-95');
  assert.equal(c.breakpoint, '2xl');
  assert.equal(c.state, 'active');
});

// ───────── group-hover ─────────

test('classifyUtility: group-hover:scale-105 → state=group-hover', () => {
  const c = classifyUtility('group-hover:scale-105');
  assert.equal(c.property, 'transform');
  assert.equal(c.state, 'group-hover');
  assert.equal(c.value, 'scale(1.05)');
});

// ───────── rotate ─────────

test('classifyUtility: rotate-45 → transform rotate(45deg)', () => {
  const c = classifyUtility('rotate-45');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'rotate(45deg)');
});

test('classifyUtility: rotate-90 → rotate(90deg)', () => {
  const c = classifyUtility('rotate-90');
  assert.equal(c.value, 'rotate(90deg)');
});

test('classifyUtility: hover:rotate-45 → state=hover', () => {
  const c = classifyUtility('hover:rotate-45');
  assert.equal(c.state, 'hover');
  assert.equal(c.value, 'rotate(45deg)');
});

test('classifyUtility: rotate-[10deg] arbitrary → rotate(10deg)', () => {
  const c = classifyUtility('rotate-[10deg]');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'rotate(10deg)');
});

// ───────── translate ─────────

test('classifyUtility: translate-x-2 → translateX(8px)', () => {
  const c = classifyUtility('translate-x-2');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'translateX(8px)');
});

test('classifyUtility: translate-y-4 → translateY(16px)', () => {
  const c = classifyUtility('translate-y-4');
  assert.equal(c.value, 'translateY(16px)');
});

test('classifyUtility: translate-x-[12px] arbitrary', () => {
  const c = classifyUtility('translate-x-[12px]');
  assert.equal(c.value, 'translateX(12px)');
});

// ───────── skew ─────────

test('classifyUtility: skew-x-12 → skewX(12deg)', () => {
  const c = classifyUtility('skew-x-12');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'skewX(12deg)');
});

test('classifyUtility: skew-y-3 → skewY(3deg)', () => {
  const c = classifyUtility('skew-y-3');
  assert.equal(c.value, 'skewY(3deg)');
});

// ───────── arbitrary [transform:...] ─────────

test('classifyUtility: [transform:rotate(10deg)] arbitrary property', () => {
  const c = classifyUtility('[transform:rotate(10deg)]');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'rotate(10deg)');
});

test('classifyUtility: [transform:scale(0.95)]', () => {
  const c = classifyUtility('[transform:scale(0.95)]');
  assert.equal(c.property, 'transform');
  assert.equal(c.value, 'scale(0.95)');
});

test('classifyUtility: active:[transform:var(--foo)] arbitrary с псевдо', () => {
  const c = classifyUtility('active:[transform:var(--foo)]');
  assert.equal(c.property, 'transform');
  assert.equal(c.state, 'active');
  assert.equal(c.value, 'var(--foo)');
});

test('classifyUtility: md:hover:[transform:scale(1.1)] breakpoint+state', () => {
  const c = classifyUtility('md:hover:[transform:scale(1.1)]');
  assert.equal(c.property, 'transform');
  assert.equal(c.breakpoint, 'md');
  assert.equal(c.state, 'hover');
  assert.equal(c.value, 'scale(1.1)');
});

// ───────── граничные случаи ─────────

test('classifyUtility: scale-foo → null (unknown)', () => {
  assert.equal(classifyUtility('scale-foo'), null);
});

test('classifyUtility: rotate-foo → null', () => {
  assert.equal(classifyUtility('rotate-foo'), null);
});

test('classifyUtility: translate-z-2 → null (z не поддерживается)', () => {
  assert.equal(classifyUtility('translate-z-2'), null);
});
