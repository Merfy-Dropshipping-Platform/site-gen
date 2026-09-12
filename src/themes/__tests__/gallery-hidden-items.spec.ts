/**
 * Скрытый элемент галереи не рисуется, а секция остаётся.
 *
 * Требование владельца: секция не пропадает, когда показывать нечего. Один
 * элемент — одна картинка, ноль — остаётся секция со своими текстами.
 *
 * Баг был в том, что «глаз» на параметре галереи не делал ничего: плитка
 * продолжала рисоваться и на витрине, и в превью. Мерчант, спрятавший
 * единственный элемент, видел не секцию со своими текстами, а плитку-заглушку.
 * У «Списка коллекций» item-уровневый hidden отбрасывался давно — галерея жила
 * без этого.
 */
import { extractPageBlocks } from '../page-blocks';

// Форма как в ревизии сайта: pagesData[<страница>].content.
const gallery = (items: unknown[]) => ({
  pagesData: {
    home: {
      content: [
        {
          type: 'Gallery',
          props: { id: 'G', heading: 'Галерея', items, padding: { top: 40, bottom: 40 } },
        },
      ],
    },
  },
});

type Block = { type: string; props: Record<string, unknown> };
const itemsOf = (blocks: Block[]) =>
  (blocks.find((b) => b.type === 'Gallery')?.props.items ?? []) as unknown[];

describe('галерея: скрытые элементы', () => {
  it('скрытый элемент не доезжает до рендера', async () => {
    const blocks = (await extractPageBlocks(
      gallery([
        { id: 'i1', type: 'image', url: '/a.png' },
        { id: 'i2', type: 'image', url: '/b.png', hidden: true },
      ]),
      'home',
      null,
      'rose',
      'site-1',
    )) as Block[];
    expect(itemsOf(blocks)).toHaveLength(1);
    expect((itemsOf(blocks)[0] as { id: string }).id).toBe('i1');
  });

  it('единственный скрытый элемент оставляет секцию без плиток', async () => {
    const blocks = (await extractPageBlocks(
      gallery([{ id: 'i1', type: 'image', url: '/a.png', hidden: true }]),
      'home',
      null,
      'rose',
      'site-1',
    )) as Block[];
    const g = blocks.find((b) => b.type === 'Gallery');
    expect(g).toBeDefined(); // секция на месте
    expect(itemsOf(blocks)).toHaveLength(0);
    expect(g?.props.heading).toBe('Галерея');
  });

  it('видимые элементы не трогаем', async () => {
    const blocks = (await extractPageBlocks(
      gallery([
        { id: 'i1', type: 'image', url: '/a.png' },
        { id: 'i2', type: 'product', productId: 'p1' },
      ]),
      'home',
      null,
      'rose',
      'site-1',
    )) as Block[];
    expect(itemsOf(blocks)).toHaveLength(2);
  });
});
