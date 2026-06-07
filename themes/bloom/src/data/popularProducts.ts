import type { Product } from '../types/product';

export const popularProducts: Product[] = [
	{
		id: 'bag-1',
		name: 'Крем-флюид с гелевой текстурой',
		price: '3 990 ₽',
		oldPrice: '4 440 ₽',
		discount: true,
		image: '/images/trend-1.webp',
	},
	{
		id: 'bag-2',
		name: 'Маска для волос',
		price: '2 490 ₽',
		image: '/images/trend-2.webp',
	},
	{
		id: 'bag-3',
		name: 'Крем для лица',
		price: '2 690 ₽',
		image: '/images/trend-3.webp',
	},
	{
		id: 'bag-4',
		name: 'Увлажняющее молочко',
		price: '2 190 ₽',
		image: '/images/trend-4.webp',
	},
];
