// Тесты вспомогательных утилит (вычисление диапазонов, путей, имён токенов)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyUtility,
  splitPrefixes,
  isStructural,
} from '../lib/utility-classify.mjs';

// Имитация buildTokenName из catalog-block-aspects.mjs
function buildTokenName(block, element, property, state, breakpoint) {
  const blockK = kebab(block);
  const elementK = kebab(element).replace(/\./g, '-');
  const propK = property;
  const stateK = state ? `-${state}` : '';
  const bpK = breakpoint ? `-${breakpoint}` : '';
  return `--${blockK}-${elementK}-${propK}${stateK}${bpK}`;
}
function kebab(s) { return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

test('buildTokenName: Header + nav + max-width + 2xl', () => {
  assert.equal(
    buildTokenName('Header', 'nav', 'max-width', null, '2xl'),
    '--header-nav-max-width-2xl',
  );
});

test('buildTokenName: Header + navLink + color + hover', () => {
  assert.equal(
    buildTokenName('Header', 'navLink', 'color', 'hover', null),
    '--header-nav-link-color-hover',
  );
});

test('buildTokenName: вложенный mobileMenu.root → mobile-menu-root', () => {
  assert.equal(
    buildTokenName('Header', 'mobileMenu.root', 'background-color', null, null),
    '--header-mobile-menu-root-background-color',
  );
});

test('buildTokenName: state + breakpoint оба', () => {
  assert.equal(
    buildTokenName('Header', 'navLink', 'color', 'hover', 'md'),
    '--header-nav-link-color-hover-md',
  );
});

test('классификация утилиты с complex значением var(--*)', () => {
  const c = classifyUtility('text-[length:var(--size-nav-link)]');
  assert.equal(c.property, 'font-size');
  assert.equal(c.value, 'var(--size-nav-link)');
});

test('классификация text-[rgb(var(--color-text))]', () => {
  const c = classifyUtility('text-[rgb(var(--color-text))]');
  assert.equal(c.property, 'color');
});

test('split: data-привязка как state', () => {
  const r = splitPrefixes('data-[open=true]:flex');
  // data-... считается state
  assert.equal(r.state, 'data-[open=true]');
});

test('split: dark: считается state', () => {
  const r = splitPrefixes('dark:bg-black');
  assert.equal(r.state, 'dark');
});

test('isStructural: 0 → структурное', () => {
  assert.equal(isStructural('0'), true);
});

test('isStructural: flex-col, flex-row → структурное', () => {
  assert.equal(isStructural('flex-col'), true);
  assert.equal(isStructural('flex-row'), true);
});
