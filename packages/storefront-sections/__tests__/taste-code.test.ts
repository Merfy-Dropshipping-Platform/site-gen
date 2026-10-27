import { describe, expect, it } from 'vitest';
import { problemDoc } from '../src/problem-info';
import { isWarning } from '../src/problems';
import { prepareSection } from '../src/prepare';
import { tasteProblems } from '../src/taste-check';

// Код шаблона (taste-code.ts, страница code.md): ?: внутри ?:, условие из многих частей, ветка class:list на каждое
// значение поля, одно условие в нескольких местах. На каждое правило — срабатывает и не срабатывает; пороги — на
// границе. Только предупреждения: секция принимается.
const CODE = /^taste-(?:nested-ternary|long-condition|class-branches|repeated-condition)$/;
const codeProblems = async (body: string) =>
  (await tasteProblems({ 'template.astro': body })).filter((item) => CODE.test(item.code));
const found = async (body: string): Promise<string[]> =>
  (await codeProblems(body)).map((item) => `${item.code} ${item.line}:${item.column}`);

describe('?: внутри ?:', () => {
  it('склонение тремя ветками — предупреждение у внешнего ?:, одно на выражение', async () => {
    const body = "<p>{n % 10 === 1 ? 'товар' : n % 10 < 5 ? 'товара' : 'товаров'}</p>";
    const result = await codeProblems(body);
    expect(result.map((item) => `${item.code} ${item.line}:${item.column}`)).toEqual(['taste-nested-ternary 1:5']);
    expect(result[0]?.message).toContain('уровней: 2');
  });

  it('цепочка ?: по виду блока с разметкой в ветках — тоже вложенность', async () => {
    const body = "{blocks.map((block) => block.type === 'a' ? <p>a</p> : block.type === 'b' ? <p>b</p> : <p>c</p>)}";
    expect(await found(body)).toEqual(['taste-nested-ternary 1:24']);
  });

  it('?: внутри разметки ветки — уже другое выражение; один ?: и ?: рядом — без предупреждений', async () => {
    expect(await found("{settings.a ? <div>{settings.b ? 'x' : 'y'}</div> : <p>z</p>}")).toEqual([]);
    expect(await found("<p class:list={[settings.a ? 'm-0' : 'm-2', settings.b ? 'p-0' : 'p-2']}>x</p>")).toEqual([]);
  });
});

describe('условие из многих частей', () => {
  it('четыре части через || и && — предупреждение с числом частей', async () => {
    const result = await codeProblems('{(settings.a || settings.b || settings.c) && settings.d && <p>x</p>}');
    expect(result.map((item) => `${item.code} ${item.line}:${item.column}`)).toEqual(['taste-long-condition 1:2']);
    expect(result[0]?.message).toContain('из 4 частей');
  });

  it('три части и разметка или список в конце — без предупреждений', async () => {
    expect(await found('{settings.a && settings.b && settings.c && <p>x</p>}')).toEqual([]);
    expect(
      await found('{settings.a && settings.b && settings.c && blocks.map((block) => <p>{block.type}</p>)}'),
    ).toEqual([]);
  });

  it('части внутри предиката some(…) — своё условие, не части внешнего', async () => {
    const body =
      "{settings.a && blocks.some((block) => block.type === 'x' && block.settings.b && block.settings.c) && <p>x</p>}";
    expect(await found(body)).toEqual([]);
  });
});

describe('class:list: ветка на каждое значение поля', () => {
  it('три значения одного поля — предупреждение с атрибутом data- и вариантом', async () => {
    const body =
      "<div class:list={['flex', { 'min-h-64': settings.height === 'small', 'min-h-96': settings.height === 'medium', 'min-h-112': settings.height === 'large' }]}>x</div>";
    const result = await codeProblems(body);
    expect(result.map((item) => item.code)).toEqual(['taste-class-branches']);
    expect(result[0]?.message).toContain('data-height={settings.height}');
    expect(result[0]?.message).toContain('data-[height=small]:');
  });

  it('поле в скобках и ветки в двух объектах одного атрибута — одно предупреждение', async () => {
    const body =
      "<h2 class:list={[{ 'text-xl': settings['heading-size'] === 'small' }, settings['heading-size'] === 'medium' ? 'text-2xl' : 'text-3xl', { 'tracking-wide': settings['heading-size'] !== 'large' }]}>x</h2>";
    const result = await codeProblems(body);
    expect(result.map((item) => item.code)).toEqual(['taste-class-branches']);
    expect(result[0]?.message).toContain('data-heading-size=');
  });

  it('два значения, разные поля, сравнения вне class — без предупреждений', async () => {
    expect(
      await found("<p class:list={[{ 'm-0': settings.size === 'small', 'm-2': settings.size === 'large' }]}>x</p>"),
    ).toEqual([]);
    expect(
      await found(
        "<p class:list={[{ 'm-0': settings.a === 'x', 'p-0': settings.b === 'y', 'gap-0': settings.c === 'z' }]}>x</p>",
      ),
    ).toEqual([]);
    const outside = await found(
      "<p data-size={settings.size === 'small' ? 's' : settings.size === 'medium' ? 'm' : settings.size === 'large' ? 'l' : ''}>x</p>",
    );
    expect(outside.filter((item) => item.startsWith('taste-class-branches'))).toEqual([]);
  });
});

describe('одно условие в нескольких местах', () => {
  it('третье одинаковое сравнение — предупреждение у первого со строками; !== — то же условие', async () => {
    const body = [
      "{settings.kind === 'side' && <p>a</p>}",
      "<div class:list={[{ 'flex': settings.kind === 'side' }]}>b</div>",
      "{settings.kind !== 'side' && <p>c</p>}",
    ].join('\n');
    const result = await codeProblems(body);
    expect(result.map((item) => `${item.code} ${item.line}:${item.column}`)).toEqual(['taste-repeated-condition 1:2']);
    expect(result[0]?.message).toContain('в 3 местах (строки 1, 2, 3)');
  });

  it('предикат blocks.some(…) трижды — одно условие целиком', async () => {
    const some = "blocks.some((block) => block.type === 'filters')";
    const body = `{${some} && <p>a</p>}\n{${some} && <p>b</p>}\n<p class:list={[{ 'm-0': !${some} }]}>c</p>`;
    expect(await found(body)).toEqual(['taste-repeated-condition 1:2']);
  });

  it('адрес ссылки и адрес страницы — подсказка про aria-current', async () => {
    const link =
      "<a aria-current={item.url === page.path ? 'page' : undefined} class:list={[item.url === page.path ? 'text-heading' : 'text-muted-foreground']} href={item.url}>{item.label}</a>";
    const body = `{settings.menu.items.map((item) => <li>${link}{item.url === page.path && <span>•</span>}</li>)}`;
    const result = await codeProblems(body);
    expect(result.map((item) => item.code)).toEqual(['taste-repeated-condition']);
    expect(result[0]?.message).toContain('aria-[current=page]:');
  });

  it('два раза, проверка поля без сравнения, вывод списка map — без предупреждений', async () => {
    expect(await found("{settings.kind === 'side' && <p>a</p>}\n{settings.kind === 'side' && <p>b</p>}")).toEqual([]);
    expect(
      await found(
        '{settings.heading && <h2>{settings.heading}</h2>}\n{settings.heading && <p>a</p>}\n{!settings.heading && <p>b</p>}',
      ),
    ).toEqual([]);
    const list = 'blocks.map((block) => <p>{block.type}</p>)';
    expect(await found(`{settings.a && ${list}}\n{settings.b && ${list}}\n{settings.c && ${list}}`)).toEqual([]);
  });
});

describe('в приёме секции', () => {
  const manifest = JSON.stringify({ sdk: 1, name: 'code', kind: 'section', title: 'Код' });
  const bad = "<p class=\"m-0\">{settings.n === 1 ? 'товар' : settings.n === 2 ? 'товара' : 'товаров'}</p>";

  it('вложенный ?: — секция принята, предупреждение со ссылкой на раздел code.md', async () => {
    const result = await prepareSection({ prefix: 'shop', files: { 'section.json': manifest, 'template.astro': bad } });
    expect(result.ok).toBe(true);
    const warnings = result.ok ? result.section.warnings : [];
    expect(warnings.map((item) => item.code)).toEqual(['taste-nested-ternary']);
    expect(warnings.every((item) => isWarning(item))).toBe(true);
    expect(problemDoc('taste-nested-ternary')).toBe('code.md#вложенные-условия');
  });

  it('шаблон с вариантами data-[…]: и списком данных — предупреждений нет', async () => {
    const good = [
      '<div class="group data-[height=small]:min-h-64 data-[height=large]:min-h-112" data-height="small">',
      '  <p class="m-0 in-data-[height=small]:text-sm">Товаров: 3</p>',
      "  <ul class=\"m-0 list-none p-0\">{[{ url: '/a', label: 'А' }, { url: '', label: 'Б' }].filter((link) => link.url).map((link) => <li><a href={link.url}>{link.label}</a></li>)}</ul>",
      '</div>',
    ].join('\n');
    const result = await prepareSection({
      prefix: 'shop',
      files: { 'section.json': manifest, 'template.astro': good },
    });
    expect(result.ok && result.section.warnings).toEqual([]);
  });
});
