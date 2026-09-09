import { MultiColumnsStoredSchema } from '../blocks/MultiColumns';
import { MultiRowsStoredSchema } from '../blocks/MultiRows';
import { PublicationsStoredSchema } from '../blocks/Publications';
import { VideoStoredSchema } from '../blocks/Video';

describe('origin/main constructor defaults ↔ stored theme schemas', () => {
  it('normalizes the exact legacy MultiColumns default without losing effective values', () => {
    const parsed = MultiColumnsStoredSchema.parse({
      id: 'MultiColumns',
      heading: { enabled: 'true', text: 'Мультиколонны', size: 'small' },
      columnsCount: '3',
      width: 'small',
      imageAspectRatio: 'adapt',
      button: '',
      link: { href: '#' },
      textPosition: 'left',
      background: { enabled: 'true' },
      colorScheme: 'scheme-2',
      containerColorScheme: 'scheme-2',
      columns: [
        { title: 'Колонна', description: 'Текст', image: '', imageSize: 'small', headingSize: 'small', textSize: 'small', link: { enabled: 'true', text: 'Ссылка', href: '#' } },
        { title: 'Колонна', description: 'Текст', image: '', imageSize: 'small', headingSize: 'small', textSize: 'small', link: { enabled: 'false', text: '', href: '#' } },
        { title: 'Колонна', description: 'Текст', image: '', imageSize: 'small', headingSize: 'small', textSize: 'small', link: { enabled: 'false', text: '', href: '#' } },
      ],
    });

    expect(parsed).toMatchObject({
      heading: 'Мультиколонны', headingSize: 'small', displayColumns: 3,
      width: 'small', imageAspectRatio: 'adapt', buttonLink: '#',
      containerEnabled: 'true', padding: { top: 80, bottom: 80 },
    });
    expect(parsed.columns[0]).toMatchObject({ linkText: 'Ссылка', link: '#' });
    expect(parsed.columns[1]).toMatchObject({ linkText: '', link: '#' });
  });

  it('normalizes the exact legacy MultiRows default without losing effective values', () => {
    const parsed = MultiRowsStoredSchema.parse({
      id: 'MultiRows', size: 'small', width: 'small', rowsPosition: 'alternate',
      heading: { enabled: 'true', text: 'Мультиряды', size: 'small' },
      buttonStyle: 'primary', alignment: 'left', colorScheme: 'scheme-2', containerColorScheme: 'scheme-1',
      rows: [
        { id: 'row-1', image: '/main-image.png', title: 'Изображение с текстом', headingSize: 'small', description: 'Текст', textSize: 'small', button: { enabled: 'true', text: 'Кнопка', link: '#' } },
        { id: 'row-2', image: '/main-image.png', title: 'Изображение с текстом', headingSize: 'small', description: 'Текст', textSize: 'small', button: { enabled: 'true', text: 'Кнопка', link: '#' } },
      ],
    });

    expect(parsed).toMatchObject({
      heading: 'Мультиряды', headingSize: 'small', size: 'small', width: 'small',
      rowsPosition: 'left', padding: { top: 80, bottom: 80 },
    });
    expect(parsed.rows[0].button).toEqual({ text: 'Кнопка', href: '#' });
  });

  it('normalizes the exact legacy Video default without losing effective values', () => {
    const parsed = VideoStoredSchema.parse({
      id: 'Video', video: { url: 'legacy.mp4', coverImage: 'legacy.jpg' },
      position: 'window', size: 'large', overlay: 0,
      content: {
        size: 'medium',
        heading: { enabled: 'true', text: 'Legacy video', size: 'small' },
        subheading: { enabled: 'false', text: 'Hidden' },
      },
      colorScheme: 'scheme-2',
    });

    expect(parsed).toMatchObject({
      heading: 'Legacy video', headingSize: 'small', videoUrl: 'legacy.mp4', poster: 'legacy.jpg',
      position: 'window', size: 'large', overlay: 0, colorScheme: 'scheme-2',
      padding: { top: 80, bottom: 80 },
    });
    expect(parsed.subheading).toBe('');
  });

  it('normalizes the exact legacy Publications default and safely clamps its counts', () => {
    const parsed = PublicationsStoredSchema.parse({
      id: 'Publications', mode: 'auto', categoryFilter: 'all', publicationType: 'Новости',
      cardsCount: 6,
      heading: { enabled: 'true', text: 'Публикации', size: 'small' },
      columnsCount: 4, dateTime: { enabled: 'true' }, colorScheme: 'scheme-2',
    });

    expect(parsed).toMatchObject({
      heading: 'Публикации', headingSize: 'small', publicationType: 'news',
      cards: 4, cardsCount: 4, columns: 4, columnsCount: 4,
      showDateTime: 'true', padding: { top: 80, bottom: 80 },
    });
  });
});
