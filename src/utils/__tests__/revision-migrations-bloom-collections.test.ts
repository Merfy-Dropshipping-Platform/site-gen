import { migrateRevisionData } from '../revision-migrations';

/**
 * Collections и легаси-форма nav-tile (`collections[]` + `cardLinkBase`).
 *
 * ИСТОРИЯ. Секция bloom переезжала с навигационной сетки плиток-коллекций на
 * сетку карточек одной коллекции, и для этого существовала миграция ревизий
 * `migrateBloomCollectionsProps` (первый `collectionId` из массива →
 * сингулярный `collection`, stale-пропы вычищались). Она появилась в
 * `dad995ed` и была удалена в `e861cb47` — сейчас в `revision-migrations.ts`
 * её нет, и тесты, ожидавшие превращения пропов, врали про поведение.
 *
 * ФАКТ СЕГОДНЯ. Легаси-пропы просто остаются в данных, а порт их игнорирует и
 * берёт коллекции магазина. Пруф (2026-09-09, прод-bloom `c868ab50…`):
 * `POST /api/sites/<id>/preview/block` с `{collections:[…], cardLinkBase:'/c/'}`
 * и с `{collection:'hydro'}` даёт БАЙТ-В-БАЙТ одинаковый HTML (30040 байт,
 * 29 ссылок). То есть потеря миграции безвредна для витрины.
 *
 * ЧТО ОХРАНЯЕТ ЭТОТ ФАЙЛ. Что миграции ревизий не мутируют пропы Collections ни
 * для bloom, ни для других тем: данные мерчанта переживают прогон без потерь и
 * прогон идемпотентен. Если миграцию когда-нибудь вернут — эти ожидания
 * покраснеют, и это будет правильный сигнал пересмотреть файл, а не тихая
 * рассинхронизация, как было до 2026-09-10.
 */
describe('Collections: легаси nav-tile пропы переживают миграцию ревизий', () => {
  const coll = (result: unknown, page = 'home', idx = 0) =>
    (result as { pagesData: Record<string, any> }).pagesData[page].content[idx];

  const legacyBlock = (id: string) => ({
    type: 'Collections',
    props: {
      id,
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
  });

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  it('bloom: пропы остаются дословно (миграции больше нет)', () => {
    const before = legacyBlock('Collections-1');
    const result = migrateRevisionData(
      { pagesData: { home: { content: [clone(before)] } } },
      'bloom',
    );
    expect(coll(result).props).toEqual(before.props);
  });

  it('другая тема: пропы тоже остаются дословно', () => {
    const before = legacyBlock('Collections-2');
    const result = migrateRevisionData(
      { pagesData: { home: { content: [clone(before)] } } },
      'satin',
    );
    expect(coll(result).props).toEqual(before.props);
  });

  it('новая форма (сингулярный `collection`) не трогается', () => {
    const initial = {
      pagesData: {
        home: {
          content: [
            {
              type: 'Collections',
              props: { id: 'Collections-3', collection: 'daily', columns: 3 },
            },
          ],
        },
      },
    };
    const result = migrateRevisionData(initial, 'bloom');
    expect(coll(result).props).toEqual({
      id: 'Collections-3',
      collection: 'daily',
      columns: 3,
    });
  });

  it('идемпотентность: второй прогон ничего не меняет', () => {
    const initial = { pagesData: { home: { content: [legacyBlock('Collections-4')] } } };
    const first = migrateRevisionData(initial, 'bloom');
    const second = migrateRevisionData(first, 'bloom');
    expect(JSON.stringify(coll(second))).toBe(JSON.stringify(coll(first)));
  });
});
