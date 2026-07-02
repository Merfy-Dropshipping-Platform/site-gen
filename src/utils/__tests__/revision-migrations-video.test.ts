import { migrateRevisionData } from '../revision-migrations';

/**
 * Video «Размер» split. Исторически единственное top-level поле `size` было
 * подписано «Размер заголовка» и управляло КЕГЛЕМ <h2>. Канон (как Hero) —
 * два независимых регулятора: `size` = ВЫСОТА медиа-блока, `headingSize` =
 * кегль заголовка. backfillVideoSizeSplit переносит legacy `size` в
 * `headingSize` (сохраняя выбранный кегль) и очищает `size`, чтобы высота
 * осталась дефолтной.
 */
describe('backfillVideoSizeSplit', () => {
  const video = (result: unknown, page = 'home', idx = 1) =>
    (result as { pagesData: Record<string, any> }).pagesData[page].content[idx];

  it('moves legacy top-level size → headingSize and clears size', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { id: 'h' } },
            { type: 'Video', props: { id: 'Video-1', heading: 'ТЕСТ', size: 'large' } },
            { type: 'Footer', props: { id: 'f' } },
          ],
        },
      },
    });
    const v = video(result);
    expect(v.props.headingSize).toBe('large');
    expect(v.props.size).toBeUndefined();
    // заголовок и прочие пропы не тронуты
    expect(v.props.heading).toBe('ТЕСТ');
  });

  it('does NOT touch when headingSize already present (idempotent / new blocks)', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { id: 'h' } },
            {
              type: 'Video',
              props: { id: 'Video-2', size: 'small', headingSize: 'large' },
            },
          ],
        },
      },
    });
    const v = video(result);
    // size остаётся высотой, headingSize остаётся кеглем — оба сохранены
    expect(v.props.size).toBe('small');
    expect(v.props.headingSize).toBe('large');
  });

  it('does NOT touch a Video block without top-level size', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { id: 'h' } },
            { type: 'Video', props: { id: 'Video-3', heading: 'X' } },
          ],
        },
      },
    });
    const v = video(result);
    expect(v.props.headingSize).toBeUndefined();
    expect(v.props.size).toBeUndefined();
  });

  it('ignores non-Video blocks with a size prop', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            { type: 'Hero', props: { id: 'Hero-1', size: 'large' } },
          ],
        },
      },
    });
    const hero = (result as { pagesData: Record<string, any> }).pagesData.home.content[0];
    // Hero.size (высота секции) не трогается — сплит только для Video
    expect(hero.props.size).toBe('large');
    expect(hero.props.headingSize).toBeUndefined();
  });
});
