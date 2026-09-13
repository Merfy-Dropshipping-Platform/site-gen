import { migrateRevisionData } from '../revision-migrations';

/**
 * Решение владельца 2026-09-13: «Убрать из пункта Размер сектор „Как в секции"
 * во всех темах. Придавать размеры заголовку как везде».
 *
 * Что было. Дефолтом нового ряда «Мультирядов» стояло `size: 'inherit'`
 * («Как в секции»), и отдельная миграция ЕЩЁ И ПЕРЕПИСЫВАЛА сохранённые
 * `size: 'small'` в `inherit`. После снятия опции из панели такие ряды остались
 * бы со значением, которого в списке нет: Puck-селект показал бы пустоту, а
 * `CustomFieldsPanel.updateProp` при правке СОСЕДНЕГО поля домержил бы дефолт
 * и молча сменил размер ряда на витрине.
 *
 * Что должно стать. Значение `inherit` переносится в тот размер, который
 * ряд И ТАК рисовал: `MultiRows.astro` берёт `aspectKey(row.size, sectionSize)`,
 * где `sectionSize = props.size === 'small' || 'large' ? props.size : 'medium'`.
 * Замерено реальным рендером rose (dist/theme-sections):
 *   секция small  + ряд inherit → aspect-[429/309] (= ряд small)
 *   секция medium + ряд inherit → aspect-[429/444] (= ряд medium)
 *   секция large  + ряд inherit → aspect-[430/500] (= ряд large)
 *   секции без size + ряд inherit → aspect-[429/444] (= medium)
 * Поэтому перенос обязан повторять ровно эту таблицу — иначе у мерчанта
 * изменится вид.
 */
describe('перенос MultiRows size: inherit → фактический размер', () => {
  const mr = (result: unknown, page = 'home', idx = 0) =>
    (result as { pagesData: Record<string, any> }).pagesData[page].content[idx];

  const block = (sectionSize: string | undefined, rowSizes: (string | undefined)[]) => ({
    type: 'MultiRows',
    props: {
      id: 'MultiRows-1',
      ...(sectionSize ? { size: sectionSize } : {}),
      rows: rowSizes.map((s, i) => ({
        id: `row-${i + 1}`,
        title: `Ряд ${i + 1}`,
        ...(s ? { size: s } : {}),
      })),
    },
  });

  const run = (b: unknown) =>
    migrateRevisionData({ pagesData: { home: { content: [b] } } });

  it.each([
    ['small', 'small'],
    ['medium', 'medium'],
    ['large', 'large'],
  ])('секция %s → ряд получает %s', (sectionSize, expected) => {
    const out = mr(run(block(sectionSize, ['inherit'])));
    expect(out.props.rows[0].size).toBe(expected);
  });

  it('секция без размера → ряд получает medium (фолбэк порта)', () => {
    const out = mr(run(block(undefined, ['inherit'])));
    expect(out.props.rows[0].size).toBe('medium');
  });

  it('секция с мусорным размером → ряд получает medium (фолбэк порта)', () => {
    const out = mr(run(block('гигантская', ['inherit'])));
    expect(out.props.rows[0].size).toBe('medium');
  });

  it('осознанный выбор мерчанта не трогаем', () => {
    const out = mr(run(block('large', ['small', 'medium', 'large'])));
    expect(out.props.rows.map((r: any) => r.size)).toEqual(['small', 'medium', 'large']);
  });

  it('ряд вообще без size остаётся без него', () => {
    // Отсутствие значения — законное состояние: рендер сам возьмёт секционный
    // фолбэк. Дописывать сюда размер значило бы материализовать в данные то,
    // чего мерчант не выбирал.
    const out = mr(run(block('large', [undefined])));
    expect(out.props.rows[0].size).toBeUndefined();
  });

  it('inherit снимается и когда ряды смешанные', () => {
    const out = mr(run(block('small', ['inherit', 'large', 'inherit'])));
    expect(out.props.rows.map((r: any) => r.size)).toEqual(['small', 'large', 'small']);
  });

  it('идемпотентна: повторный прогон ничего не меняет', () => {
    const once = run(block('medium', ['inherit', 'small']));
    const twice = migrateRevisionData(once);
    expect(mr(twice).props.rows.map((r: any) => r.size)).toEqual(['medium', 'small']);
  });

  it('сохранённый small больше НЕ превращается обратно в inherit', () => {
    // Прежняя миграция relaxMultiRowsItemSize делала ровно это — после снятия
    // опции она заводила бы в данные значение, которого нет в списке.
    const out = mr(run(block('large', ['small', 'small'])));
    expect(out.props.rows.map((r: any) => r.size)).toEqual(['small', 'small']);
  });

  it('работает на любой странице, не только на главной', () => {
    const result = migrateRevisionData({
      pagesData: { 'page-about': { content: [block('large', ['inherit'])] } },
    });
    expect(mr(result, 'page-about').props.rows[0].size).toBe('large');
  });

  it('блок без рядов не ломает миграцию', () => {
    const result = migrateRevisionData({
      pagesData: { home: { content: [{ type: 'MultiRows', props: { id: 'MultiRows-1' } }] } },
    });
    expect(mr(result).props.id).toBe('MultiRows-1');
  });
});
