import { afterEach, describe, expect, it } from 'vitest';
import { createElScope } from '../src/core/el';
import { errorOf } from './core-support';

// Обёртка элемента своей секции (design.md блока 5, раздел 3.3; 15 Г): от неё не дойти до узла страницы, писать можно
// только атрибуты из списка, после снятия экземпляра она ничего не делает.
function sectionWith(html: string) {
  const root = document.createElement('merfy-section');
  root.setAttribute('data-section', 'shop:scarf-match');
  root.setAttribute('data-section-id', 'pick-1');
  root.innerHTML = html;
  document.body.append(root);
  const controller = new AbortController();
  return { root, controller, scope: createElScope(root, controller.signal) };
}

const nodeIn = (root: HTMLElement, name: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-ref="${name}"]`);

afterEach(() => {
  document.body.replaceChildren();
});

describe('обёртка элемента', () => {
  it('ref — первый по data-ref, refs — все по порядку; на каждый вызов — те же обёртки', () => {
    const { scope } = sectionWith('<button data-ref="coat">Серое</button><button data-ref="coat">Чёрное</button>');
    const coats = scope.refs('coat');
    expect(coats.map((coat) => coat.text())).toEqual(['Серое', 'Чёрное']);
    expect(scope.ref('coat')).toBe(coats[0]);
    expect(scope.refs('coat')[1]).toBe(coats[1]);
    expect(scope.refs('coat').indexOf(coats[1])).toBe(1);
    expect(scope.ref('scarf')).toBeNull();
    expect(scope.refs('scarf')).toEqual([]);
  });

  it('у обёртки только методы, сама она заморожена', () => {
    const { scope } = sectionWith('<p data-ref="hint">Подсказка</p>');
    const hint = scope.ref('hint');
    expect(hint).not.toBeNull();
    expect(Object.isFrozen(hint)).toBe(true);
    expect(Object.values(hint ?? {}).every((value) => typeof value === 'function')).toBe(true);
  });

  it('nodeOf — узел своей обёртки (для ядра); обёртка другого экземпляра — null', () => {
    const one = sectionWith('<p data-ref="hint">1</p>');
    const two = sectionWith('<p data-ref="hint">2</p>');
    const hint = one.scope.ref('hint');
    expect(hint === null ? null : one.scope.nodeOf(hint)).toBe(nodeIn(one.root, 'hint'));
    expect(hint === null ? undefined : two.scope.nodeOf(hint)).toBeNull();
    expect(one.scope.wrap(one.root)).toBe(one.scope.wrap(one.root));
  });

  it('text: пишет и читает; элемент, который мерчант правит в превью (contenteditable), не трогает', () => {
    const { scope } = sectionWith(
      '<p data-ref="title">Шарф</p><div contenteditable="true"><span data-ref="edited">Мерчант пишет</span></div>',
    );
    scope.ref('title')?.text(42);
    expect(scope.ref('title')?.text()).toBe('42');
    scope.ref('edited')?.text('из скрипта');
    expect(scope.ref('edited')?.text()).toBe('Мерчант пишет');
  });

  it('классы, показать и скрыть', () => {
    const { root, scope } = sectionWith('<div data-ref="card" hidden></div>');
    const card = scope.ref('card');
    card?.toggleClass('opacity-40', true);
    expect(card?.hasClass('opacity-40')).toBe(true);
    card?.toggleClass('opacity-40');
    expect(card?.hasClass('opacity-40')).toBe(false);
    expect(card?.visible()).toBe(false);
    card?.show();
    expect(nodeIn(root, 'card')?.hasAttribute('hidden')).toBe(false);
    card?.toggle();
    expect(card?.visible()).toBe(false);
    card?.toggle(true);
    expect(card?.visible()).toBe(true);
    card?.hide();
    expect(nodeIn(root, 'card')?.hasAttribute('hidden')).toBe(true);
  });

  it.each([
    ['aria-pressed', 'true'],
    ['data-coat', 'grey'],
    ['hidden', ''],
    ['disabled', ''],
    ['title', 'Серое пальто'],
    ['tabindex', '0'],
    ['role', 'status'],
    ['href', '/catalog/scarves'],
    ['href', '#reviews'],
    ['href', 'https://merfy.ru/blog'],
    ['href', 'mailto:shop@example.ru'],
    ['href', 'tel:+79990000000'],
  ])('писать можно: %s="%s"', (name, value) => {
    const { root, scope } = sectionWith('<a data-ref="link" href="/">Ссылка</a>');
    scope.ref('link')?.attr(name, value);
    expect(nodeIn(root, 'link')?.getAttribute(name)).toBe(value);
  });

  it.each([
    ['onclick', 'alert(1)'],
    ['ONCLICK', 'alert(1)'],
    ['style', 'color:red'],
    ['class', 'x'],
    ['id', 'x'],
    ['data-action', 'pick'],
    ['data-ref', 'other'],
    ['data-behavior', 'carousel'],
    ['data-animate', 'appear'],
    ['data-section', 'shop:other'],
    ['data-section-id', 'other-1'],
    ['data-merfy-edit', 'title'],
    ['href', 'javascript:alert(1)'],
    ['href', ' JavaScript:alert(1)'],
    ['href', '//evil.example/x'],
    ['href', '/\\evil.example/x'],
    ['href', 'http://merfy.ru'],
    ['href', 'catalog'],
    ['src', '/media/scarf.jpg'],
  ])('писать нельзя: %s="%s" — attr-forbidden, атрибут прежний', (name, value) => {
    const { root, scope } = sectionWith('<a data-ref="link" href="/">Ссылка</a>');
    const before = nodeIn(root, 'link')?.getAttribute(name.toLowerCase());
    expect(errorOf(() => scope.ref('link')?.attr(name, value))).toMatchObject({ code: 'attr-forbidden' });
    expect(nodeIn(root, 'link')?.getAttribute(name.toLowerCase())).toBe(before);
  });

  it.each([['/media/scarf.jpg'], ['https://cdn.merfy.ru/scarf.jpg']])('src у img: %s — можно', (value) => {
    const { root, scope } = sectionWith('<img data-ref="photo" src="/a.jpg" alt="">');
    scope.ref('photo')?.attr('src', value);
    expect(nodeIn(root, 'photo')?.getAttribute('src')).toBe(value);
  });

  it.each([['data:image/png;base64,AAAA'], ['javascript:alert(1)'], ['//evil.example/x.jpg'], ['http://x.ru/a.jpg']])(
    'src у img: %s — attr-forbidden',
    (value) => {
      const { root, scope } = sectionWith('<img data-ref="photo" src="/a.jpg" alt="">');
      expect(errorOf(() => scope.ref('photo')?.attr('src', value))).toMatchObject({ code: 'attr-forbidden' });
      expect(nodeIn(root, 'photo')?.getAttribute('src')).toBe('/a.jpg');
    },
  );

  it('attr(name, null) снимает атрибут; читать можно любой', () => {
    const { root, scope } = sectionWith('<button data-ref="buy" title="Купить" onclick="x()">Купить</button>');
    const buy = scope.ref('buy');
    expect(buy?.attr('onclick')).toBe('x()');
    buy?.attr('title', null);
    expect(nodeIn(root, 'buy')?.hasAttribute('title')).toBe(false);
  });

  it('cssVar ставит --имя; url(), кавычки и «\\» в значении — attr-forbidden; null снимает', () => {
    const { root, scope } = sectionWith('<div data-ref="bar"></div>');
    const bar = scope.ref('bar');
    bar?.cssVar('progress', 40);
    expect(nodeIn(root, 'bar')?.style.getPropertyValue('--progress')).toBe('40');
    expect(errorOf(() => bar?.cssVar('bg', 'url(https://evil.example/x.png)'))).toMatchObject({
      code: 'attr-forbidden',
    });
    expect(errorOf(() => bar?.cssVar('bg', 'image-set("https://evil.example/x.png" 1x)'))).toMatchObject({
      code: 'attr-forbidden',
    });
    expect(errorOf(() => bar?.cssVar('bg', 'u\\72 l(x.png)'))).toMatchObject({ code: 'attr-forbidden' });
    expect(errorOf(() => bar?.cssVar('--bg', 'red'))).toMatchObject({ code: 'attr-forbidden' });
    bar?.cssVar('progress', null);
    expect(nodeIn(root, 'bar')?.style.getPropertyValue('--progress')).toBe('');
  });

  it('поля формы: value, checked, form() по name — флажок boolean, радио — значение выбранного', () => {
    const { scope } = sectionWith(`<form data-ref="form">
      <input data-ref="email" name="email" value="a@b.ru">
      <input data-ref="agree" type="checkbox" name="agree" checked>
      <input type="radio" name="size" value="s"><input type="radio" name="size" value="m" checked>
      <select name="color"><option value="grey" selected>Серый</option></select>
      <textarea name="note">к пальто</textarea>
      <button type="submit" name="send">Отправить</button>
    </form>`);
    expect(scope.ref('email')?.value()).toBe('a@b.ru');
    scope.ref('email')?.value('c@d.ru');
    expect(scope.ref('email')?.value()).toBe('c@d.ru');
    expect(scope.ref('agree')?.checked()).toBe(true);
    scope.ref('agree')?.checked(false);
    expect(scope.ref('form')?.form()).toEqual({
      email: 'c@d.ru',
      agree: false,
      size: 'm',
      color: 'grey',
      note: 'к пальто',
    });
    expect(Object.isFrozen(scope.ref('form')?.form())).toBe(true);
  });

  it('el.ref и el.refs — внутри элемента; closest — сам или предок с data-ref, не выше секции', () => {
    const { root, scope } = sectionWith(
      '<ul data-ref="list"><li data-ref="row"><button data-ref="buy">Купить</button></li><li data-ref="row"></li></ul>' +
        '<p data-ref="buy">вне списка</p>',
    );
    const outer = document.createElement('div');
    outer.setAttribute('data-ref', 'outer');
    document.body.append(outer);
    outer.append(root);
    const list = scope.ref('list');
    const buy = list?.ref('buy');
    expect(list?.refs('row')).toHaveLength(2);
    expect(buy?.text()).toBe('Купить');
    expect(buy?.closest('row')).toBe(list?.refs('row')[0]);
    expect(buy?.closest('buy')).toBe(buy);
    expect(buy?.closest('outer')).toBeNull();
  });

  it('list: строки по <template> сразу после него; новый вызов заменяет прошлые строки', () => {
    const { root, scope } = sectionWith(
      '<ul data-ref="lines"><template><li data-ref="line"><span data-ref="name"></span></li></template></ul>',
    );
    const lines = scope.ref('lines');
    lines?.list(['Шарф', 'Палантин'], (row, item, index) => row.ref('name')?.text(`${index + 1}. ${item}`));
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['1. Шарф', '2. Палантин']);
    expect(root.querySelector('ul')?.firstElementChild?.tagName).toBe('TEMPLATE');
    lines?.list(['Снуд'], (row, item) => row.ref('name')?.text(item));
    expect([...root.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Снуд']);
    expect(scope.refs('line')).toHaveLength(1);
  });

  it('после снятия экземпляра: чтение — пустое, запись ничего не делает и не бросает', () => {
    const { root, scope, controller } = sectionWith('<p data-ref="title">Шарф</p>');
    const title = scope.ref('title');
    controller.abort();
    title?.text('после снятия');
    expect(errorOf(() => title?.attr('onclick', 'x()'))).toBeUndefined();
    expect(root.textContent).toBe('Шарф');
    expect(title?.text()).toBe('');
    expect(title?.attr('data-ref')).toBeNull();
    expect(scope.ref('title')).toBeNull();
    expect(scope.refs('title')).toEqual([]);
  });
});
