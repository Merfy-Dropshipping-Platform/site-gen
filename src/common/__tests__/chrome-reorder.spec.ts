import {
  reorderChrome,
  CHROME_REORDER_INLINE,
  type ReorderDoc,
  type ReorderNode,
} from '../chrome-reorder';

/**
 * Мини-DOM: ровно те операции, которыми пользуется перестановка
 * (`parentElement`, `childNodes`, `nextSibling`, `contains`, `insertBefore`).
 * Тестируем настоящую функцию агента, а не её пересказ.
 */
class Node implements ReorderNode {
  children: Node[] = [];
  parentElement: Node | null = null;
  moves = 0;

  constructor(
    readonly name: string,
    readonly blockId?: string,
  ) {}

  get parentNode(): Node | null {
    return this.parentElement;
  }

  get childNodes(): Node[] {
    return this.children;
  }

  get nextSibling(): Node | null {
    const p = this.parentElement;
    if (!p) return null;
    const i = p.children.indexOf(this);
    return i >= 0 && i + 1 < p.children.length ? p.children[i + 1] : null;
  }

  append(...kids: Node[]): this {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }

  contains(other: ReorderNode): boolean {
    let n: ReorderNode | null = other;
    while (n) {
      if (n === this) return true;
      n = n.parentElement;
    }
    return false;
  }

  insertBefore(node: ReorderNode, ref: ReorderNode | null): ReorderNode {
    const child = node as Node;
    const old = child.parentElement;
    if (old) old.children.splice(old.children.indexOf(child), 1);
    child.parentElement = this;
    child.moves += 1;
    const at = ref ? this.children.indexOf(ref as Node) : -1;
    if (at === -1) this.children.push(child);
    else this.children.splice(at, 0, child);
    return child;
  }

  /** Плоский порядок детей по имени — то, что проверяем. */
  order(): string[] {
    return this.children.map((c) => c.name);
  }
}

function docFor(root: Node): ReorderDoc {
  return {
    querySelector(selector: string): ReorderNode | null {
      const m = /\[data-puck-component-id="([^"]+)"\]/.exec(selector);
      if (!m) return null;
      const want = m[1];
      const walk = (n: Node): Node | null => {
        if (n.blockId === want) return n;
        for (const c of n.children) {
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(root);
    },
  };
}

/** body: промо, шапка, <main>(Hero), подвал — как раскладывает composeV2Page. */
function buildPage() {
  const promo = new Node('promo', 'PromoBanner-1');
  const header = new Node('header', 'Header-1');
  const hero = new Node('hero', 'Hero-1');
  const main = new Node('main').append(hero);
  const footer = new Node('footer', 'Footer-1');
  const body = new Node('body').append(promo, header, main, footer);
  return { body, main, promo, header, footer, doc: docFor(body) };
}

describe('reorderChrome (106-fix: хром вне <main> слушается перестановки)', () => {
  it('меняет местами промо-баннер и шапку прямо в DOM', () => {
    const { body, main, doc } = buildPage();
    expect(body.order()).toEqual(['promo', 'header', 'main', 'footer']);

    reorderChrome(
      [
        { id: 'Header-1' },
        { id: 'PromoBanner-1' },
        { id: 'Hero-1' },
        { id: 'Footer-1' },
      ],
      main,
      doc,
    );

    expect(body.order()).toEqual(['header', 'promo', 'main', 'footer']);
  });

  it('повторный вызов с тем же порядком не трогает узлы', () => {
    const { body, main, promo, header, footer, doc } = buildPage();
    const target = [
      { id: 'PromoBanner-1' },
      { id: 'Header-1' },
      { id: 'Hero-1' },
      { id: 'Footer-1' },
    ];

    reorderChrome(target, main, doc);
    reorderChrome(target, main, doc);

    expect(body.order()).toEqual(['promo', 'header', 'main', 'footer']);
    // Перенос узла сбрасывает живое поддерево (sticky-шапка, видео) — его быть
    // не должно, раз порядок и так верный.
    expect([promo.moves, header.moves, footer.moves]).toEqual([0, 0, 0]);
  });

  it('подвал, поднятый выше секций тела, встаёт перед <main>', () => {
    const { body, main, doc } = buildPage();

    reorderChrome(
      [
        { id: 'Header-1' },
        { id: 'Footer-1' },
        { id: 'PromoBanner-1' },
        { id: 'Hero-1' },
      ],
      main,
      doc,
    );

    expect(body.order()).toEqual(['header', 'footer', 'promo', 'main']);
  });

  it('двигает scheme-обёртку, а не сам блок внутри неё', () => {
    const promoInner = new Node('promo-inner', 'PromoBanner-1');
    const promoWrap = new Node('promo-scheme').append(promoInner);
    const header = new Node('header', 'Header-1');
    const main = new Node('main').append(new Node('hero', 'Hero-1'));
    const body = new Node('body').append(promoWrap, header, main);

    reorderChrome(
      [{ id: 'Header-1' }, { id: 'PromoBanner-1' }, { id: 'Hero-1' }],
      main,
      docFor(body),
    );

    expect(body.order()).toEqual(['header', 'promo-scheme', 'main']);
    expect(promoInner.parentElement).toBe(promoWrap);
  });

  it('скрытый хром вне целевого списка остаётся на месте и не мешает сверке', () => {
    const { body, main, footer, doc } = buildPage();

    // Шапка скрыта → её нет в target; промо и подвал порядок не меняют.
    reorderChrome(
      [{ id: 'PromoBanner-1' }, { id: 'Hero-1' }, { id: 'Footer-1' }],
      main,
      doc,
    );

    expect(body.order()).toEqual(['promo', 'header', 'main', 'footer']);
    expect(footer.moves).toBe(0);
  });

  it('инлайн-текст для агента объявляет __rcOrderChrome и его хелперы', () => {
    expect(CHROME_REORDER_INLINE).toContain('var __rcOrderChrome =');
    expect(CHROME_REORDER_INLINE).toContain('var collectSide =');
    expect(CHROME_REORDER_INLINE).toContain('var sameOrder =');
    expect(CHROME_REORDER_INLINE).toContain('var indexOfNode =');
    // Сериализованное тело обязано быть самодостаточным: без импортов и без
    // ссылок на модульные обёртки сборщика.
    expect(CHROME_REORDER_INLINE).not.toMatch(/\brequire\(/);
    expect(CHROME_REORDER_INLINE).not.toMatch(/\bexports\./);
  });
});
