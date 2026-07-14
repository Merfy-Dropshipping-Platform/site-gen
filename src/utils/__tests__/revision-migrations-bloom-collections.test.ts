import { migrateRevisionData } from '../revision-migrations';

/**
 * Bloom «оживление» Collections: секция переехала с навигационной сетки плиток-
 * коллекций (nav-tile `collections[]` + `cardLinkBase`) на сетку карточек товара
 * одной коллекции (сингулярный строковый проп `collection`). Существующие
 * bloom-ревизии со старым shape мигрируются: ПЕРВЫЙ `collectionId` из массива →
 * `collection`, stale `collections[]`/`cardLinkBase` удаляются. Theme-gated (bloom).
 */
describe('migrateBloomCollectionsProps', () => {
  const coll = (result: unknown, page = 'home', idx = 0) =>
    (result as { pagesData: Record<string, any> }).pagesData[page].content[idx];

  it('maps first old collectionId → singular `collection` and drops nav-tile props', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          home: {
            content: [
              {
                type: 'Collections',
                props: {
                  id: 'Collections-1',
                  heading: 'Сейчас в тренде',
                  columns: 3,
                  imageView: 'square',
                  padding: { top: 80, bottom: 80 },
                  cardLinkBase: '/catalog?collection=',
                  collections: [
                    { id: 'col-1', collectionId: 'hydro', heading: 'HYDRO', image: '' },
                    { id: 'col-2', collectionId: 'daily', heading: 'DAILY', image: '' },
                  ],
                },
              },
            ],
          },
        },
      },
      'bloom',
    );
    const c = coll(result);
    expect(c.props.collection).toBe('hydro'); // первый collectionId
    expect(c.props.collections).toBeUndefined(); // stale массив удалён
    expect(c.props.cardLinkBase).toBeUndefined(); // stale префикс удалён
    // прочие пропы сохранены дословно
    expect(c.props.heading).toBe('Сейчас в тренде');
    expect(c.props.columns).toBe(3);
    expect(c.props.imageView).toBe('square');
    expect(c.props.padding).toEqual({ top: 80, bottom: 80 });
  });

  it('does NOT overwrite an existing singular `collection` (only clears stale props)', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          home: {
            content: [
              {
                type: 'Collections',
                props: {
                  id: 'Collections-2',
                  collection: 'lift', // мерчант уже выбрал источник
                  cardLinkBase: '/catalog?collection=',
                  collections: [{ id: 'col-1', collectionId: 'hydro', heading: 'HYDRO' }],
                },
              },
            ],
          },
        },
      },
      'bloom',
    );
    const c = coll(result);
    expect(c.props.collection).toBe('lift'); // не перезаписан
    expect(c.props.collections).toBeUndefined();
    expect(c.props.cardLinkBase).toBeUndefined();
  });

  it('clears stale props even when every collectionId is null (empty picker → SSG demo)', () => {
    const result = migrateRevisionData(
      {
        pagesData: {
          home: {
            content: [
              {
                type: 'Collections',
                props: {
                  id: 'Collections-3',
                  cardLinkBase: '/catalog?collection=',
                  collections: [
                    { id: 'col-1', collectionId: null, heading: 'Коллекция 1' },
                    { id: 'col-2', collectionId: null, heading: 'Коллекция 2' },
                  ],
                },
              },
            ],
          },
        },
      },
      'bloom',
    );
    const c = coll(result);
    expect(c.props.collection).toBeUndefined(); // нет валидного id → остаётся демо
    expect(c.props.collections).toBeUndefined(); // но stale shape вычищен
    expect(c.props.cardLinkBase).toBeUndefined();
  });

  it('leaves an already-new-shape Collections block untouched (no-op)', () => {
    const initial = {
      pagesData: {
        home: {
          content: [
            {
              type: 'Collections',
              props: { id: 'Collections-4', collection: 'daily', columns: 3 },
            },
          ],
        },
      },
    };
    const result = migrateRevisionData(initial, 'bloom');
    const c = coll(result);
    expect(c.props).toEqual({ id: 'Collections-4', collection: 'daily', columns: 3 });
  });

  it('does NOT touch Collections for non-bloom themes', () => {
    const initial = {
      pagesData: {
        home: {
          content: [
            {
              type: 'Collections',
              props: {
                id: 'Collections-5',
                cardLinkBase: '/catalog?collection=',
                collections: [{ id: 'col-1', collectionId: 'mebel', heading: 'Мебель' }],
              },
            },
          ],
        },
      },
    };
    const result = migrateRevisionData(initial, 'satin');
    const c = coll(result);
    // satin оставляет nav-tile shape нетронутым (порт-параметр другой темы)
    expect(c.props.collections).toEqual([
      { id: 'col-1', collectionId: 'mebel', heading: 'Мебель' },
    ]);
    expect(c.props.cardLinkBase).toBe('/catalog?collection=');
    expect(c.props.collection).toBeUndefined();
  });

  it('is idempotent (running twice = identical result)', () => {
    const initial = {
      pagesData: {
        home: {
          content: [
            {
              type: 'Collections',
              props: {
                id: 'Collections-6',
                cardLinkBase: '/catalog?collection=',
                collections: [{ id: 'col-1', collectionId: 'hydro', heading: 'HYDRO' }],
              },
            },
          ],
        },
      },
    };
    const first = migrateRevisionData(initial, 'bloom');
    const second = migrateRevisionData(first, 'bloom');
    expect(JSON.stringify(coll(second))).toBe(JSON.stringify(coll(first)));
    expect(coll(second).props.collection).toBe('hydro');
  });
});
