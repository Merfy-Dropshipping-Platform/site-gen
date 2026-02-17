import type { Collection } from '../../types';

/**
 * 5 realistic mock collections with Russian names.
 */
export const mockCollections: Collection[] = [
  {
    id: 'col_summer',
    handle: 'summer-collection',
    title: 'Летняя коллекция',
    description: 'Легкая одежда для жарких дней: платья, шорты, футболки.',
    image: {
      url: 'https://placehold.co/1200x600?text=Summer+Collection',
      alt: 'Летняя коллекция',
    },
    productCount: 18,
  },
  {
    id: 'col_basics',
    handle: 'basics',
    title: 'Базовый гардероб',
    description: 'Незаменимые вещи на каждый день: футболки, джинсы, рубашки.',
    image: {
      url: 'https://placehold.co/1200x600?text=Basics',
      alt: 'Базовый гардероб',
    },
    productCount: 15,
  },
  {
    id: 'col_outerwear',
    handle: 'outerwear',
    title: 'Верхняя одежда',
    description: 'Куртки, пальто и тренчи на любую погоду.',
    image: {
      url: 'https://placehold.co/1200x600?text=Outerwear',
      alt: 'Верхняя одежда',
    },
    productCount: 8,
  },
  {
    id: 'col_accessories',
    handle: 'accessories',
    title: 'Аксессуары',
    description: 'Сумки, ремни, шарфы, очки и другие аксессуары.',
    image: {
      url: 'https://placehold.co/1200x600?text=Accessories',
      alt: 'Аксессуары',
    },
    productCount: 12,
  },
  {
    id: 'col_sport',
    handle: 'sport-active',
    title: 'Спорт и активный отдых',
    description: 'Одежда для тренировок, йоги и активного образа жизни.',
    image: {
      url: 'https://placehold.co/1200x600?text=Sport+Active',
      alt: 'Спорт и активный отдых',
    },
    productCount: 6,
  },
];
