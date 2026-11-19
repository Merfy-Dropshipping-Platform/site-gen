import { describe, expect, it } from 'vitest';
import { kitPlanOf, libsOf } from '../src/features';

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

  it('ctx.split в скрипте — тот же провайдер; text.split(",") строки — нет', () => {
    expect(kitPlanOf(KNOWN, [], ['mount(el, ctx) { ctx.split(el.ref("h"), "words"); }']).animate).toBe(true);
    expect(kitPlanOf(KNOWN, [], ['const parts = text.split(","); const split = 1;']).animate).toBe(false);
    expect(kitPlanOf(KNOWN, [], ['ctx.on("document", "pointermove", () => {});']).animate).toBe(true);
  });

  it('13.11: scroll в скрипте — scroll.js, inView — in-view.js; без них полей нет (план прежний)', () => {
    const script = 'mount(el, ctx) { ctx.scroll(el, (p) => p); ctx.inView(el, () => {}); }';
    expect(kitPlanOf(KNOWN, [], [script])).toMatchObject({ scroll: true, inView: true });
    expect(kitPlanOf(KNOWN, [], ['const scrolled = 1; const inViewport = 2;'])).toEqual({
      behaviors: [],
      reveal: false,
      animate: false,
    });
    expect(kitPlanOf(KNOWN, ['<p>scroll inView</p>'], [])).not.toHaveProperty('scroll');
  });

  it.each([
    ['стор страницы $scroll и ref("scroll")', 'mount(e){e.watch(e.page.$scroll,n=>e.ref("scroll")?.text(String(n)))}'],
    ['событие страницы', 'mount(e){e.on("window","scroll",()=>{});e.on("window","resize",()=>{})}'],
    ['имена классов', 'mount(e){e.toggleClass("animate-pulse");e.toggleClass("scroll-smooth")}'],
    ['прокрутка окна и слово в имени', 'mount(){window.scrollTo(0,0);const inViewport=1,scrolled=2}'],
  ])('19.11: %s — не обращение к ctx, файлов анимаций нет', (_, script) => {
    expect(kitPlanOf(KNOWN, [], [script])).toEqual({ behaviors: [], reveal: false, animate: false });
  });

  it.each([
    ['сжатый скрипт: e.scroll(…)', 'mount(e){e.scroll(e.ref("a"),r=>r)}', { scroll: true }],
    ['необязательный вызов', 'mount(e){e?.inView?.(e.ref("a"),()=>{})}', { inView: true }],
    ['поля в параметре mount', 'mount({scroll:e,inView:n}){e(a)}', { scroll: true, inView: true }],
    ['деструктуризация ctx', 'mount(c){const{animate:a}=c;a(c.ref("a"),{})}', { animate: true }],
    ['имя в скобках', 'mount(e){e["inView"](e.ref("a"),()=>{})}', { inView: true }],
  ])('19.11: %s — обращение к ctx, файл подключается', (_, script, expected) => {
    expect(kitPlanOf(KNOWN, [], [script])).toMatchObject(expected);
  });

  it('13.11: библиотеки — по "lib:<имя>" в uses секций, только известные сборке ядра', () => {
    expect(libsOf(['motion'], ['cart', 'lib:motion', 'lib:gsap'])).toEqual(['motion']);
    expect(libsOf(['motion'], ['cart'])).toEqual([]);
    expect(kitPlanOf(KNOWN, [], [], ['motion'])).toMatchObject({ libs: ['motion'] });
    expect(kitPlanOf(KNOWN, [], [], [])).not.toHaveProperty('libs');
  });

  it('ничего нет — пустой набор', () => {
    expect(kitPlanOf(KNOWN, ['<p>текст</p>'], [])).toEqual({ behaviors: [], reveal: false, animate: false });
  });
});
