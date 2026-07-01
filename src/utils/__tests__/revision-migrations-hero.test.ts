import { migrateRevisionData } from '../revision-migrations';

/**
 * Баг «пустые инпуты в панели, а кнопка/заголовок отображаются» (Hero, rose).
 * Старые ревизии хранят Hero в ПЛОСКОЙ форме (title/subtitle/cta), а поля
 * конструктора привязаны к ВЛОЖЕННЫМ (heading.text / text.content /
 * primaryButton.text). Рендер читает обе формы, поля — только новые → пусто.
 * Бэкфилл копирует непустые legacy → nested (legacy сохраняем для rollback).
 */
describe('backfillHeroLegacyProps', () => {
  const hero = (result: unknown, page = 'home', idx = 1) =>
    (result as { pagesData: Record<string, any> }).pagesData[page].content[idx];

  it('backfills primaryButton/heading/text from legacy cta/title/subtitle', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { id: 'h' } },
            {
              type: 'Hero',
              props: {
                id: 'Hero-1',
                title: 'Добро пожаловать',
                subtitle: 'Классика с характером',
                cta: { text: 'Смотреть каталог', href: '/catalog' },
              },
            },
            { type: 'Footer', props: { id: 'f' } },
          ],
        },
      },
    });
    const h = hero(result);
    expect(h.props.primaryButton).toEqual({
      text: 'Смотреть каталог',
      link: { href: '/catalog' },
    });
    expect(h.props.heading).toEqual({ text: 'Добро пожаловать' });
    expect(h.props.text).toEqual({ content: 'Классика с характером' });
    // legacy сохраняется 1-в-1 (backward-compat при rollback кода)
    expect(h.props.cta).toEqual({ text: 'Смотреть каталог', href: '/catalog' });
  });

  it('does NOT overwrite existing new-shape props', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            {
              type: 'Hero',
              props: {
                id: 'Hero-2',
                title: 'Legacy title',
                cta: { text: 'Legacy cta', href: '/old' },
                heading: { text: 'New heading' },
                primaryButton: { text: 'New button', link: { href: '/new' } },
              },
            },
          ],
        },
      },
    });
    const h = hero(result, 'home', 0);
    expect(h.props.heading).toEqual({ text: 'New heading' });
    expect(h.props.primaryButton).toEqual({ text: 'New button', link: { href: '/new' } });
  });

  it('preserves heading.size / text.size when backfilling text', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            {
              type: 'Hero',
              props: {
                id: 'Hero-3',
                title: 'Заголовок',
                heading: { size: 'large' },
              },
            },
          ],
        },
      },
    });
    const h = hero(result, 'home', 0);
    expect(h.props.heading).toEqual({ size: 'large', text: 'Заголовок' });
  });

  it('skips empty legacy values (no phantom empty props)', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            {
              type: 'Hero',
              props: { id: 'Hero-4', title: '', subtitle: '', cta: { text: '', href: '' } },
            },
          ],
        },
      },
    });
    const h = hero(result, 'home', 0);
    expect(h.props.primaryButton).toBeUndefined();
    expect(h.props.heading).toBeUndefined();
    expect(h.props.text).toBeUndefined();
  });

  // Пруф на ДОСЛОВНЫХ пропах реального сайта ef6e5979 (rev 13dbade5): у него
  // subtitle пустой ("") → text НЕ бэкфиллится (нет подзаголовка на витрине),
  // а heading + primaryButton наполняются из title + cta.
  it('matches real site ef6e5979 Hero (subtitle empty → no text prop)', () => {
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [
            {
              type: 'Hero',
              props: {
                id: 'Hero-1782914701238',
                cta: { href: '/catalog', text: 'Смотреть каталог' },
                size: 'large',
                title: 'Добро пожаловать',
                overlay: 40,
                subtitle: '',
                colorScheme: 'scheme-3',
              },
            },
          ],
        },
      },
    });
    const h = hero(result, 'home', 0);
    expect(h.props.primaryButton).toEqual({ text: 'Смотреть каталог', link: { href: '/catalog' } });
    expect(h.props.heading).toEqual({ text: 'Добро пожаловать' });
    expect(h.props.text).toBeUndefined(); // subtitle пустой → не создаём фантомный text
  });

  it('is idempotent for the Hero block (running twice = same result)', () => {
    const initial = {
      pagesData: {
        home: {
          content: [
            { type: 'Hero', props: { id: 'H', title: 'T', cta: { text: 'C', href: '/c' } } },
          ],
        },
      },
    };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(hero(second, 'home', 0))).toBe(
      JSON.stringify(hero(first, 'home', 0)),
    );
  });
});
