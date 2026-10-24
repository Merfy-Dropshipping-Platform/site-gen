import { describe, expect, it } from 'vitest';
import { kitPlanOf } from '../src/features';

// Что странице нужно из поведений и анимаций SDK (блок 6, часть 6б, Р6б-2): по HTML секций и текстам их скриптов.
const KNOWN = ['accordion', 'dialog', 'carousel', 'tabs', 'nav-menu'];

describe('набор поведений страницы', () => {
  it('имена из data-behavior — в порядке каталога, без повторов; чужих имён и имён вне каталога нет', () => {
    const html = [
      '<merfy-section><div data-behavior="carousel"></div><div data-behavior=\'accordion\'></div></merfy-section>',
      '<div data-behavior=carousel></div><div data-behavior="Carousel"></div><div data-behavior="foo"></div>',
    ];
    expect(kitPlanOf(KNOWN, html, [])).toEqual({ behaviors: ['accordion', 'carousel'], reveal: false, animate: false });
  });

  it('имя с дефисом; атрибут в скрипте секции (разметка, которую пишет код) тоже считается', () => {
    const scripts = ['export default { mount(el) { el.html(\'<nav data-behavior="nav-menu"></nav>\'); } };'];
    expect(kitPlanOf(KNOWN, ['<div></div>'], scripts).behaviors).toEqual(['nav-menu']);
  });

  it('data-animate в HTML или в тексте скрипта — появления; без него — нет', () => {
    expect(kitPlanOf(KNOWN, ['<h2 data-animate="appear">x</h2>'], []).reveal).toBe(true);
    expect(kitPlanOf(KNOWN, ['<h2>x</h2>'], ['const a = "data-animate";']).reveal).toBe(true);
    expect(kitPlanOf(KNOWN, ['<h2 class="animate-pulse">x</h2>'], []).reveal).toBe(false);
  });

  it('ctx.animate в скрипте — провайдер; слово внутри другого имени — нет; в HTML — нет', () => {
    expect(kitPlanOf(KNOWN, [], ['export default { mount(el, ctx) { ctx.animate(el.ref("a"), {}); } };']).animate).toBe(true);
    expect(kitPlanOf(KNOWN, [], ['const animated = 1; const animateMe = 2;']).animate).toBe(false);
    expect(kitPlanOf(KNOWN, ['<p>animate</p>'], []).animate).toBe(false);
  });

  it('ничего нет — пустой набор', () => {
    expect(kitPlanOf(KNOWN, ['<p>текст</p>'], [])).toEqual({ behaviors: [], reveal: false, animate: false });
  });
});
