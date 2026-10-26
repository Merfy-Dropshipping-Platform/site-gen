import { describe, expect, it } from 'vitest';
import { behaviorProblems } from '../src/behavior-check';
import { PROBLEM_CODES, isWarning, problem } from '../src/problems';

// Поведения и появления в шаблоне секции (блок 6, часть 6б; Р6б-8).
const FRONT = '---\nconst { settings, blocks } = Astro.props;\n---\n';
const summary = async (body: string) =>
  (await behaviorProblems(`${FRONT}${body}`)).map((item) => [item.code, item.message]);

const CAROUSEL = `<div data-behavior="carousel" data-effect="fade" data-change="700" data-autoplay="3" data-loop="false" data-drag>
  <div data-part="viewport"><div data-part="container">{blocks.map((block) => (
    <div data-part="slide" data-animate="fade-up" data-delay="100">{block.settings.heading}</div>
  ))}</div></div>
  <button data-part="prev">Назад</button><span data-part="counter"></span>
</div>`;

describe('поведения в шаблоне', () => {
  it('верная разметка — слайдер с частями и параметрами, аккордеон, появление — проблем нет', async () => {
    expect(await summary(CAROUSEL)).toEqual([]);
    expect(
      await summary(
        '<div data-behavior="accordion" data-animate="appear-group"><details><summary>q</summary><div data-part="content">a</div></details></div>',
      ),
    ).toEqual([]);
  });

  it('behavior-unknown: опечатка в имени — место и список имён каталога', async () => {
    const [found] = await behaviorProblems(`${FRONT}<div>\n  <div data-behavior="carosel"></div>\n</div>`);
    expect(found).toMatchObject({ code: 'behavior-unknown', file: 'template.astro', line: 5, column: 8 });
    expect(found?.message).toBe(
      'поведения carosel нет в каталоге SDK; есть: accordion, dialog, carousel, tabs, nav-menu, quantity, card-photos, sticky-header, video, catalog, search, zoom',
    );
  });

  it('behavior-part-unknown: часть не из каталога поведения — ближайший корень; вложенный корень со своей частью — можно', async () => {
    expect(await summary('<div data-behavior="accordion"><div data-part="body">a</div></div>')).toEqual([
      ['behavior-part-unknown', 'у поведения accordion нет части body; есть: content'],
    ]);
    expect(
      await summary(
        '<div data-behavior="carousel"><div data-behavior="accordion"><div data-part="slide"></div></div></div>',
      ),
    ).toEqual([['behavior-part-unknown', 'у поведения accordion нет части slide; есть: content']]);
    expect(
      await summary('<div data-behavior="carousel"><div data-behavior="accordion" data-part="slide"></div></div>'),
    ).toEqual([]);
    expect(await summary('<div data-behavior="sticky-header"><i data-part="x"></i></div>')).toEqual([
      ['behavior-part-unknown', 'у поведения sticky-header нет части x; есть: нет частей'],
    ]);
  });

  it('behavior-part-orphan: data-part вне поведения', async () => {
    expect(await summary('<div data-part="slide"></div>')).toEqual([
      ['behavior-part-orphan', 'data-part="slide" стоит вне элемента с data-behavior: часть принадлежит поведению'],
    ]);
  });

  it('behavior-param-invalid: значение вне перечисления, границ и булева вида — с правилом', async () => {
    expect(await summary('<div data-behavior="carousel" data-effect="zoom"></div>')).toEqual([
      ['behavior-param-invalid', 'data-effect="zoom" у поведения carousel: нужно одно из: slide, fade'],
    ]);
    expect(await summary('<div data-behavior="carousel" data-change="600"></div>')).toEqual([
      ['behavior-param-invalid', 'data-change="600" у поведения carousel: нужно одно из: 500, 700'],
    ]);
    expect(await summary('<div data-behavior="carousel" data-autoplay="99"></div>')).toEqual([
      ['behavior-param-invalid', 'data-autoplay="99" у поведения carousel: нужно целое число от 0 до 60'],
    ]);
    expect(await summary('<div data-behavior="carousel" data-autoplay="abc"></div>')).toHaveLength(1);
    expect(await summary('<div data-behavior="carousel" data-loop="maybe"></div>')).toEqual([
      ['behavior-param-invalid', 'data-loop="maybe" у поведения carousel: нужно true или false'],
    ]);
    expect(
      await summary('<div data-behavior="dialog" data-transition="drawer" data-side="left" data-modal="false"></div>'),
    ).toEqual([]);
  });

  it('animate-preset-unknown и data-delay: пресет вне каталога, задержка не целое 0–5000; data-delay без data-animate не проверяется', async () => {
    expect(await summary('<h2 data-animate="zoom-in"></h2>')).toEqual([
      [
        'animate-preset-unknown',
        'пресета zoom-in нет в каталоге SDK; есть: appear, appear-group, appear-side, fade-up, slide-down, load-1, load-2, load-3, letters',
      ],
    ]);
    expect(await summary('<h2 data-animate="appear" data-delay="9000"></h2>')).toEqual([
      ['behavior-param-invalid', 'data-delay="9000": нужно целое число от 0 до 5000'],
    ]);
    expect(await summary('<h2 data-animate="appear" data-delay="x"></h2>')).toHaveLength(1);
    expect(await summary('<h2 data-delay="9000"></h2>')).toEqual([]);
  });

  it('значения из выражений пропускаются: имя, параметр, пресет, часть', async () => {
    const body =
      '<div data-behavior={settings.kind} data-effect={settings.effect}><i data-part={settings.part}></i><b data-animate={settings.preset}></b></div>';
    expect(await summary(body)).toEqual([]);
    expect(await summary('<div data-behavior="carousel" data-effect={settings.effect}></div>')).toEqual([]);
  });

  it('несколько проблем — по порядку в тексте, за один заход', async () => {
    const body =
      '<div data-behavior="carousel" data-effect="zoom"><i data-part="body"></i></div><p data-animate="zoom-in"></p>';
    expect((await summary(body)).map(([code]) => code)).toEqual([
      'behavior-param-invalid',
      'behavior-part-unknown',
      'animate-preset-unknown',
    ]);
  });
});

describe('коды блока 6', () => {
  const CODES = [
    'behavior-unknown',
    'behavior-part-unknown',
    'behavior-part-orphan',
    'behavior-param-invalid',
    'animate-preset-unknown',
  ] as const;

  it('пять кодов — в общем списке, в этом порядке', () => {
    expect(PROBLEM_CODES.filter((code) => CODES.some((own) => own === code))).toEqual([...CODES]);
  });

  it('все пять — отказы, не предупреждения', () => {
    expect(CODES.filter((code) => isWarning(problem(code, 'template.astro', 'текст')))).toEqual([]);
  });
});
