export interface PukItem {
  id: number;
  title: string;
  image: string;
}

export const pukItems: PukItem[] = [
  { id: 1, title: 'Образы сезона', image: '/images/puk-1.png' },
  { id: 2, title: 'Street style', image: '/images/puk-2.png' },
  { id: 3, title: 'Classic edit', image: '/images/puk-3.png' },
];
