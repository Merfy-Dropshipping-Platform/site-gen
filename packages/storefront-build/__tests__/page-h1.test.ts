import { describe, expect, it } from 'vitest';
import { withSingleH1 } from '../src/page-h1';
import { EMPTY_PAGE_CONTENT } from '../src/sections-render';

const page = (parts: { header?: string[]; sections: string[]; footer?: string[]; overlay?: string[] }) => ({
  ...EMPTY_PAGE_CONTENT,
  ...parts,
});

const SHOP_NAME = '<h1 class="m-0 flex min-w-0"><span>Стенд</span></h1>';
const PAGE_TITLE = '<h1 class="m-0 text-balance">О стенде</h1>';

describe('один h1 на страницу', () => {
  it('главная: название магазина в шапке остаётся h1, заголовок секции становится h2 с теми же классами', () => {
    const out = withSingleH1(page({ header: [SHOP_NAME], sections: [PAGE_TITLE] }));
    expect(out.header).toEqual([SHOP_NAME]);
    expect(out.sections).toEqual(['<h2 class="m-0 text-balance">О стенде</h2>']);
  });

  it('страница без h1 в шапке: первый h1 секции остаётся, второй — h2', () => {
    const out = withSingleH1(page({ header: ['<a>Стенд</a>'], sections: [PAGE_TITLE, '<h1>Второй</h1>'] }));
    expect(out.sections).toEqual([PAGE_TITLE, '<h2>Второй</h2>']);
  });

  it('несколько h1 в одной секции: лишние — h2, открывающий и закрывающий теги вместе', () => {
    const out = withSingleH1(page({ sections: ['<h1>А</h1><p>x</p><H1 id="b">Б</H1><h1>В</h1>'] }));
    expect(out.sections).toEqual(['<h1>А</h1><p>x</p><h2 id="b">Б</h2><h2>В</h2>']);
  });

  it('подвал и окна поверх страницы тоже считаются, порядок страницы: шапка, секции, подвал, окна', () => {
    const out = withSingleH1(
      page({
        header: ['<p>шапка</p>'],
        sections: ['<p>текст</p>'],
        footer: ['<h1>Подвал</h1>'],
        overlay: ['<h1>Окно</h1>'],
      }),
    );
    expect(out.footer).toEqual(['<h1>Подвал</h1>']);
    expect(out.overlay).toEqual(['<h2>Окно</h2>']);
  });

  it('h1 в <template> и под hidden не считается и не меняется', () => {
    const hub = '<div hidden><h1>Заказ</h1></div><template><h1>Шаблон</h1></template><h1>Основные данные</h1>';
    const out = withSingleH1(page({ header: [SHOP_NAME], sections: [hub] }));
    expect(out.sections).toEqual([
      '<div hidden><h1>Заказ</h1></div><template><h1>Шаблон</h1></template><h2>Основные данные</h2>',
    ]);
  });

  it('скрытый h1 раньше видимого не отнимает у видимого место', () => {
    const out = withSingleH1(page({ sections: ['<h1 hidden>Скрыт</h1><h1>Виден</h1>'] }));
    expect(out.sections).toEqual(['<h1 hidden>Скрыт</h1><h1>Виден</h1>']);
  });

  it('h1 в скрипте, комментарии и <h10> — не заголовки', () => {
    const html = '<script>"<h1>"</script><!-- <h1>x</h1> --><h10>y</h10><h1>Один</h1>';
    expect(withSingleH1(page({ header: [SHOP_NAME], sections: [html] })).sections).toEqual([
      '<script>"<h1>"</script><!-- <h1>x</h1> --><h10>y</h10><h2>Один</h2>',
    ]);
  });

  it('h1 без закрывающего тега меняется только в открывающем', () => {
    const out = withSingleH1(page({ header: [SHOP_NAME], sections: ['<h1>без пары'] }));
    expect(out.sections).toEqual(['<h2>без пары']);
  });

  it('один h1 или ни одного — разметка не меняется; списки, которых нет, не появляются', () => {
    const content = page({ sections: [PAGE_TITLE, '<h2>Дальше</h2>'] });
    const out = withSingleH1(content);
    expect(out.sections).toEqual(content.sections);
    expect(out.header).toBeUndefined();
    expect(out.footer).toBeUndefined();
    expect(out.overlay).toBeUndefined();
  });

  it('остальные поля страницы остаются', () => {
    const out = withSingleH1({ ...page({ sections: [PAGE_TITLE] }), mainImage: '/a.jpg' });
    expect(out.mainImage).toBe('/a.jpg');
  });
});
