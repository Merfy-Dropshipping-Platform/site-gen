import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { templateProblems } from '../src/template';

const HERO = readFileSync(new URL('../fixtures/sections/hero/template.astro', import.meta.url), 'utf8');
const FRONT = '---\nconst { settings } = Astro.props;\n---\n';
const textsOf = async (text: string) => (await templateProblems(text)).map((item) => item.message);

describe('запреты шаблона секции', () => {
  it('шаблон «Первого экрана» проходит', async () => {
    expect(await templateProblems(HERO)).toEqual([]);
  });

  it('запрещённые теги', async () => {
    expect(await textsOf(`${FRONT}<script>1</script><iframe src="/x"></iframe>`)).toEqual([
      'тег <script> в шаблоне секции запрещён: скрипт — script.ts, документ — у сборки',
      'тег <iframe> в шаблоне секции запрещён: скрипт — script.ts, документ — у сборки',
    ]);
  });

  it('компонент запрещён; Fragment, свой элемент и svg — можно', async () => {
    expect(await textsOf(`${FRONT}<Foo /><Fragment><merfy-badge></merfy-badge><svg><linearGradient /></svg></Fragment>`)).toEqual([
      'компонент <Foo>: в шаблоне секции компонентов нет, кроме <Fragment>',
    ]);
  });

  it('обработчик, set:html, директивы, {...}', async () => {
    const text = `${FRONT}<div onclick="x" set:html={settings.heading} client:load is:raw {...settings}></div>`;
    expect(await textsOf(text)).toEqual([
      'обработчик onclick: события — только в script.ts',
      'set:html можно только с настройкой вида richtext',
      'директива client:load в шаблоне секции запрещена',
      'директива is:raw в шаблоне секции запрещена',
      '{...} в атрибутах запрещён: перечисли атрибуты по одному',
    ]);
  });

  it('адрес javascript: — в атрибуте и в выражении', async () => {
    const text = `${FRONT}<a href="javascript:x">a</a><a href={'javascript:' + settings.heading}>b</a>`;
    expect(await textsOf(text)).toEqual([
      'адрес javascript: в шаблоне секции запрещён: действия — в script.ts',
      'адрес javascript: в шаблоне секции запрещён: действия — в script.ts',
    ]);
  });

  it('префикс __merfy — служебный', async () => {
    expect(await textsOf(`${FRONT}<p>{__merfyState}</p>`)).toEqual(['имя __merfyState: префикс __merfy — служебный']);
  });

  it('frontmatter: только const { settings } = Astro.props', async () => {
    expect(await textsOf('---\nimport fs from "node:fs";\nconst { settings } = Astro.props;\n---\n<p>x</p>')).toEqual([
      'во frontmatter только const { settings } = Astro.props;',
    ]);
    expect(await textsOf('---\n---\n<p>x</p>')).toEqual([]);
    expect(await textsOf('<p>без frontmatter</p>')).toEqual([]);
  });

  it('место — строка и колонка тега', async () => {
    const [found] = await templateProblems(`${FRONT}<div>\n  <script>1</script>\n</div>`);
    expect([found?.line, found?.column]).toEqual([5, 3]);
  });
});
